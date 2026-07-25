import React, { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch('/api' + path, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function Home() {
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    api('/projects')
      .then(setProjects)
      .catch((err) => console.error(err));
  }, []);

  return (
    <div className="container">
      <h1>Projects</h1>
      <div className="grid">
        {projects.map((p) => (
          <Link key={p.id} to={`/project/${p.publicId}`} className="card">
            <h2>{p.name}</h2>
            <p className="meta">{p.publicId}</p>
            <p className="meta">{p.sensors.length} sensor(s)</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Project() {
  const { publicId } = useParams();
  const [project, setProject] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const load = () => {
      api(`/projects/${publicId}`).then(setProject).catch(console.error);
      api(`/projects/${publicId}/records?limit=2000`)
        .then(setRecords)
        .catch(console.error);
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [publicId]);

  if (!project) return <div className="container">Loading...</div>;

  const bySensor = {};
  records.forEach((r) => {
    bySensor[r.sensorName] = bySensor[r.sensorName] || [];
    bySensor[r.sensorName].push(r);
  });

  Object.values(bySensor).forEach((arr) =>
    arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  );

  return (
    <div className="container">
      <Link to="/">&larr; Back to projects</Link>
      <h1>{project.name}</h1>
      <p className="meta">{project.publicId}</p>

      {project.acceptImage && project.images?.length > 0 && (
        <div className="image-block">
          <img
            src={`data:${project.images[0].mime};base64,${project.images[0].data}`}
            alt="Latest device snapshot"
            style={{ width: '500px', height: '500px', objectFit: 'contain', borderRadius: '8px', marginBottom: '1rem' }}
          />
        </div>
      )}

      {project.sensors.length === 0 && (
        <p>No sensors configured yet. Go to /admin to add some.</p>
      )}

      {Object.entries(bySensor).map(([sensor, data]) => (
        <div key={sensor} className="chart-block">
          <h3>{sensor}</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#146720"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

const EXAMPLE_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function Admin() {
  const [password, setPassword] = useState(
    localStorage.getItem('adminPw') || ''
  );
  const [logged, setLogged] = useState(false);
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [sensors, setSensors] = useState([{ name: '', minValue: 0, maxValue: 1024 }]);
  const [acceptImage, setAcceptImage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAcceptImage, setEditAcceptImage] = useState(false);
  const [editSensors, setEditSensors] = useState([]);
  const [drafts, setDrafts] = useState({});

  const defaultSensor = () => ({ name: '', minValue: 0, maxValue: 1024 });

  const addSensor = () => setSensors((prev) => [...prev, defaultSensor()]);
  const updateSensor = (index, field, value) =>
    setSensors((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  const removeSensor = (index) =>
    setSensors((prev) => prev.filter((_, i) => i !== index));

  const addEditSensor = () => setEditSensors((prev) => [...prev, defaultSensor()]);
  const updateEditSensor = (index, field, value) =>
    setEditSensors((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  const removeEditSensor = (index) =>
    setEditSensors((prev) => prev.filter((_, i) => i !== index));

  const authHeaders = { 'X-Admin-Password': password };

  const loadProjects = () =>
    api('/admin/projects', { headers: authHeaders })
      .then(setProjects)
      .catch(() => setLogged(false));

  const login = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      localStorage.setItem('adminPw', password);
      setLogged(true);
      loadProjects();
    } catch {
      alert('Wrong password');
    }
  };

  const createProject = async (e) => {
    e.preventDefault();

    const sensorList = sensors
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        minValue: Number(s.minValue) || 0,
        maxValue: Number(s.maxValue) || 1024,
      }));
    try {
      await api('/admin/projects', {
        method: 'POST',
        body: JSON.stringify({ name, sensors: sensorList, acceptImage }),
        headers: authHeaders,
      });
      setName('');
      setSensors([defaultSensor()]);
      setAcceptImage(false);
      loadProjects();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete this project and all its records?')) return;
    await api(`/admin/projects/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    loadProjects();
  };

  const generateSampleData = async (id) => {
    try {
      const { created } = await api(`/admin/projects/${id}/sample-data`, {
        method: 'POST',
        headers: authHeaders,
      });
      alert(`Created ${created} sample records`);
    } catch (err) {
      alert(err.message);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditAcceptImage(p.acceptImage);
    setEditSensors(p.sensors.length > 0 ? p.sensors : [defaultSensor()]);
  };

  const saveEdit = async (id) => {
    const sensorList = editSensors
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        minValue: Number(s.minValue) || 0,
        maxValue: Number(s.maxValue) || 1024,
      }));
    try {
      await api(`/admin/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, acceptImage: editAcceptImage, sensors: sensorList }),
        headers: authHeaders,
      });
      setEditingId(null);
      setEditSensors([]);
      loadProjects();
    } catch (err) {
      alert(err.message);
    }
  };

  const buildExamplePayload = (p) => ({
    deviceID: p.publicId,
    readings: p.sensors.length
      ? p.sensors.slice(0, 2).map((s, i) => ({
        sensorName: s.name,
        value: i === 0 ? 23.5 : 60,
      }))
      : [
        { sensorName: 'temperature', value: 23.5 },
        { sensorName: 'humidity', value: 60 },
      ],
    ...(p.acceptImage ? { image: EXAMPLE_IMAGE } : {}),
  });

  const getDefaultDraft = (p) => JSON.stringify(buildExamplePayload(p), null, 2);

  const postExample = async (p) => {
    const draft = drafts[p.id] ?? getDefaultDraft(p);
    let payload;
    try {
      payload = JSON.parse(draft);
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
      return;
    }
    try {
      await api(`/projects/${p.publicId}/records`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      alert('Payload sent');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleImageUpload = (e, p) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 500 / img.width, 500 / img.height);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        setDrafts((prev) => {
          const draft = prev[p.id] ?? getDefaultDraft(p);
          try {
            const payload = JSON.parse(draft);
            payload.image = base64;
            return { ...prev, [p.id]: JSON.stringify(payload, null, 2) };
          } catch {
            alert('Cannot update image: draft JSON is invalid');
            return prev;
          }
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  if (!logged) {
    return (
      <div className="container">
        <h1>Admin login</h1>
        <form onSubmit={login} className="form">
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button>Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Admin</h1>
      <form onSubmit={createProject} className="form">
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div style={{ width: '100%' }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Sensors</h3>
          {sensors.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Sensor name"
                value={s.name}
                onChange={(e) => updateSensor(i, 'name', e.target.value)}
                style={{ flex: 1, minWidth: '120px' }}
              />
              <input
                type="number"
                placeholder="Min"
                value={s.minValue}
                onChange={(e) => updateSensor(i, 'minValue', Number(e.target.value))}
                style={{ width: '90px', minWidth: '90px' }}
              />
              <input
                type="number"
                placeholder="Max"
                value={s.maxValue}
                onChange={(e) => updateSensor(i, 'maxValue', Number(e.target.value))}
                style={{ width: '90px', minWidth: '90px' }}
              />
              <button type="button" onClick={() => removeSensor(i)}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addSensor}>Add sensor</button>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={acceptImage}
            onChange={(e) => setAcceptImage(e.target.checked)}
          />
          Accept image
        </label>
        <button>Create project</button>
      </form>

      <h2>Existing projects</h2>
      <ul className="list">
        {projects.map((p) => (
          <li key={p.id} className="project-item">
            {editingId === p.id ? (
              <>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ marginBottom: '8px' }}
                  />
                  <br />
                  <label style={{ display: 'block', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={editAcceptImage}
                      onChange={(e) => setEditAcceptImage(e.target.checked)}
                    />
                    Accept image
                  </label>
                  <h4 style={{ margin: '8px 0 4px', fontSize: '0.9rem' }}>Sensors</h4>
                  {editSensors.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Sensor name"
                        value={s.name}
                        onChange={(e) => updateEditSensor(i, 'name', e.target.value)}
                        style={{ flex: 1, minWidth: '120px' }}
                      />
                      <input
                        type="number"
                        placeholder="Min"
                        value={s.minValue}
                        onChange={(e) => updateEditSensor(i, 'minValue', Number(e.target.value))}
                        style={{ width: '80px', minWidth: '80px' }}
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={s.maxValue}
                        onChange={(e) => updateEditSensor(i, 'maxValue', Number(e.target.value))}
                        style={{ width: '80px', minWidth: '80px' }}
                      />
                      <button type="button" onClick={() => removeEditSensor(i)}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={addEditSensor}>Add sensor</button>
                </div>
                <div>
                  <button onClick={() => saveEdit(p.id)}>Save</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  <br />
                  <small>
                    <b>Project ID:</b> <code>{p.publicId}</code>
                  </small>
                  <br />
                  <small>
                    Sensors: {p.sensors.map((s) => `${s.name} (${s.minValue}-${s.maxValue})`).join(', ') || 'none'}
                  </small>
                  <br />
                  <small>Accept image: {p.acceptImage ? 'yes' : 'no'}</small>
                  <details style={{ marginTop: '8px' }}>
                    <summary>Example device payload</summary>
                    <p style={{ marginTop: '8px' }}>
                      <b>Push URL:</b>{' '}
                      <code>{`${window.location.origin}/api/projects/${p.publicId}/records`}</code>
                    </p>
                    <textarea
                      style={{ width: '100%', minHeight: '140px', fontFamily: 'monospace' }}
                      value={drafts[p.id] ?? getDefaultDraft(p)}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                      }
                    />
                    {p.acceptImage && (
                      <>
                        <input
                          type="file"
                          id={`img-${p.id}`}
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => handleImageUpload(e, p)}
                        />
                        <button onClick={() => document.getElementById(`img-${p.id}`)?.click()}>
                          Upload image
                        </button>
                      </>
                    )}
                    <button onClick={() => postExample(p)}>Send example</button>
                  </details>
                </div>
                <div style={{ alignSelf: 'flex-start', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="btn-edit" onClick={() => startEdit(p)}>
                    ✏️ Edit
                  </button>
                  <button className="btn-sample" onClick={() => generateSampleData(p.id)}>
                    📊 Sample data
                  </button>
                  <button className="btn-delete" onClick={() => deleteProject(p.id)}>
                    🗑 Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  return (
    <div>
      <nav className="nav">
        <Link to="/" className="brand">
          <img src="/bee-mascot.png" alt="Bee Green mascot" className="logo" />
          BeeGreen
        </Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:publicId" element={<Project />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}

export default App;
