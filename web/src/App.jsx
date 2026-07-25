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
    api(`/projects/${publicId}`).then(setProject).catch(console.error);
    api(`/projects/${publicId}/records?limit=2000`)
      .then(setRecords)
      .catch(console.error);
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
                  stroke="#2563eb"
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

function Admin() {
  const [password, setPassword] = useState(
    localStorage.getItem('adminPw') || ''
  );
  const [logged, setLogged] = useState(false);
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [sensorsText, setSensorsText] = useState('');

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

    console.log("================================");
    console.log("name", name);
    console.log("sensorsText", sensorsText);
    console.log("================================");

    const sensorNames = sensorsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api('/admin/projects', {
        method: 'POST',
        body: JSON.stringify({ name, sensorNames }),
        headers: authHeaders,
      });
      setName('');
      setSensorsText('');
      loadProjects();
    } catch (err) {
      console.log("================================");
      console.log("err", err);
      console.log("================================");
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
        <input
          type="text"
          placeholder="Sensors, comma separated"
          value={sensorsText}
          onChange={(e) => setSensorsText(e.target.value)}
        />
        <button>Create project</button>
      </form>

      <h2>Existing projects</h2>
      <ul className="list">
        {projects.map((p) => (
          <li key={p.id} className="project-item">
            <div>
              <strong>{p.name}</strong>
              <br />
              <small>
                <b>Project ID:</b> <code>{p.publicId}</code>
              </small>
              <br />
              <small>
                Sensors: {p.sensors.map((s) => s.name).join(', ') || 'none'}
              </small>
              <details style={{ marginTop: '8px' }}>
                <summary>Example device payload</summary>
                <p style={{ marginTop: '8px' }}>
                  <b>Push URL:</b>{' '}
                  <code>{`${window.location.origin}/api/projects/${p.publicId}/records`}</code>
                </p>
                <pre>
                  {JSON.stringify(
                    {
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
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            </div>
            <button onClick={() => generateSampleData(p.id)}>Sample data</button>
            <button onClick={() => deleteProject(p.id)}>Delete</button>
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
