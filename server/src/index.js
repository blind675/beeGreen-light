const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function generatePublicId(name) {
  const base = (name || 'project')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '') || 'project';
  const code = crypto.randomBytes(3).toString('hex');
  return `${base}-${code}`;
}

async function uniquePublicId(name) {
  for (let i = 0; i < 10; i++) {
    const publicId = generatePublicId(name);
    const existing = await prisma.project.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (!existing) return publicId;
  }
  throw new Error('Could not generate a unique project ID');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/projects', async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      include: { sensors: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects/:publicId', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { publicId: req.params.publicId },
      include: { sensors: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects/:publicId/records', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { publicId: req.params.publicId },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const where = { projectId: project.id };
    if (req.query.sensorName) where.sensorName = req.query.sensorName;
    if (req.query.deviceID) where.deviceId = req.query.deviceID;
    if (req.query.from || req.query.to) {
      where.timestamp = {};
      if (req.query.from) where.timestamp.gte = new Date(req.query.from);
      if (req.query.to) where.timestamp.lte = new Date(req.query.to);
    }

    const limit = Math.min(parseInt(req.query.limit || '1000', 10), 10000);
    const records = await prisma.record.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    res.json(records);
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects/:publicId/records', async (req, res, next) => {
  try {
    const { deviceID, readings } = req.body || {};
    if (!deviceID || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'deviceID and readings[] are required' });
    }

    const project = await prisma.project.findUnique({
      where: { publicId: req.params.publicId },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const data = readings
      .filter(
        (r) =>
          r &&
          typeof r.sensorName === 'string' &&
          typeof r.value === 'number' &&
          !Number.isNaN(r.value)
      )
      .map((r) => ({
        projectId: project.id,
        deviceId: String(deviceID),
        sensorName: r.sensorName.trim(),
        value: r.value,
      }));

    if (data.length === 0) {
      return res.status(400).json({ error: 'No valid readings' });
    }

    const result = await prisma.record.createMany({ data });
    res.json({ created: result.count });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true });
});

app.get('/api/admin/projects', requireAdmin, async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      include: { sensors: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/projects', requireAdmin, async (req, res, next) => {
  try {
    const { name, sensorNames } = req.body || {};

    console.log("================================");
    console.log("name", name);
    console.log("sensorNames", sensorNames);
    console.log("================================");

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const sensorList = Array.isArray(sensorNames)
      ? sensorNames
        .filter((n) => typeof n === 'string')
        .map((n) => n.trim())
        .filter(Boolean)
      : [];

    const publicId = await uniquePublicId(name);

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: { publicId, name: name.trim() },
      });
      if (sensorList.length > 0) {
        await tx.sensor.createMany({
          data: sensorList.map((n) => ({ projectId: p.id, name: n })),
          skipDuplicates: true,
        });
      }
      return tx.project.findUnique({
        where: { id: p.id },
        include: { sensors: true },
      });
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/admin/projects/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/projects/:id/sensors', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const sensor = await prisma.sensor.create({
      data: { projectId: req.params.id, name: name.trim() },
    });
    res.status(201).json(sensor);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/admin/projects/:id/sensors/:sensorId', requireAdmin, async (req, res, next) => {
  try {
    await prisma.sensor.delete({ where: { id: req.params.sensorId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/projects/:id/sample-data', requireAdmin, async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { sensors: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const sensorNames = project.sensors.length
      ? project.sensors.map((s) => s.name)
      : ['temperature', 'humidity'];

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const records = [];

    for (let i = 0; i <= 60; i++) {
      const timestamp = new Date(now - oneHour + (i * oneHour) / 60);
      sensorNames.forEach((sensorName, sensorIndex) => {
        const base = sensorIndex === 0 ? 22 : 55;
        const noise = (Math.random() - 0.5) * 4;
        records.push({
          projectId: project.id,
          deviceId: 'sample-device',
          sensorName,
          value: parseFloat((base + noise).toFixed(2)),
          timestamp,
        });
      });
    }

    const result = await prisma.record.createMany({ data: records });
    res.json({ created: result.count });
  } catch (err) {
    next(err);
  }
});

const webDist = path.join(__dirname, '../../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API server is running. Frontend build not found.');
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
