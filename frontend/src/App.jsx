import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileVideo,
  RefreshCcw,
  Send,
  Trophy,
  Upload
} from "lucide-react";

const API =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  window.localStorage.getItem("VITE_API_URL") ||
  "http://localhost:5000";

function getApiUrl(path) {
  return `${API.replace(/\/+$/, "")}${path}`;
}

function describeFetchError(error) {
  return `${error.message}. Backend URL: ${API}. Test it in your browser at ${getApiUrl("/test")}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
}

function shortenHash(hash) {
  if (!hash) return "pending";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function formatTime(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDate(seconds) {
  if (!seconds) return "No timestamp";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(seconds * 1000));
}

function App() {
  const [activePage, setActivePage] = useState("submit");
  const [runs, setRuns] = useState([]);
  const [network, setNetwork] = useState(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    player: "",
    game: "",
    category: "",
    time: "",
    videoUrl: ""
  });
  const [videoFile, setVideoFile] = useState(null);
  const [videoMode, setVideoMode] = useState("url");
  const [submitting, setSubmitting] = useState(false);

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => a.timeSeconds - b.timeSeconds),
    [runs]
  );

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setError("");
    try {
      const response = await fetch(getApiUrl("/api/runs"));
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || "Could not load leaderboard");
      }
      setRuns(payload.runs || []);
      setNetwork(payload.network || null);
    } catch (requestError) {
      console.error("FETCH FAILED:", requestError);
      setError(describeFetchError(requestError));
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!API) {
      return undefined;
    }

    const events = new EventSource(getApiUrl("/api/events"));
    events.addEventListener("run-submitted", () => loadRuns());
    events.onerror = (event) => {
      console.error("FETCH FAILED:", event);
      events.close();
    };
    return () => events.close();
  }, [loadRuns]);

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  async function submitRun(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    setError("");

    try {
      const body = new FormData();
      body.append("player", form.player);
      body.append("game", form.game);
      body.append("category", form.category);
      body.append("time", form.time);

      if (videoMode === "file" && videoFile) {
        body.append("video", videoFile);
      } else {
        body.append("videoUrl", form.videoUrl);
      }

      const response = await fetch(getApiUrl("/api/submit-run"), {
        method: "POST",
        body
      });
      const payload = await parseJsonResponse(response);
      console.log(payload);

      if (!response.ok) {
        throw new Error(payload.message || "Submission failed");
      }

      setNotice(`Verified in block ${payload.blockNumber}: ${shortenHash(payload.transactionHash)}`);
      setForm({ player: "", game: "", category: "", time: "", videoUrl: "" });
      setVideoFile(null);
      await loadRuns();
      setActivePage("leaderboard");
    } catch (submitError) {
      console.error("FETCH FAILED:", submitError);
      setError(describeFetchError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local Hardhat Network</p>
          <h1>Decentralized Speedrun Verification System</h1>
        </div>
        <nav className="nav-tabs" aria-label="Primary">
          <button
            className={activePage === "submit" ? "active" : ""}
            onClick={() => setActivePage("submit")}
            type="button"
          >
            <Upload size={18} />
            Submit
          </button>
          <button
            className={activePage === "leaderboard" ? "active" : ""}
            onClick={() => setActivePage("leaderboard")}
            type="button"
          >
            <Trophy size={18} />
            Leaderboard
          </button>
        </nav>
      </header>

      <section className="status-band">
        <div>
          <span>Contract</span>
          <strong>{shortenHash(network?.contractAddress)}</strong>
        </div>
        <div>
          <span>Latest Block</span>
          <strong>{network?.latestBlockNumber ?? "offline"}</strong>
        </div>
        <div>
          <span>Chain ID</span>
          <strong>{network?.chainId ?? 31337}</strong>
        </div>
      </section>

      {notice && <p className="notice success">{notice}</p>}
      {error && <p className="notice error">{error}</p>}

      {activePage === "submit" ? (
        <section className="workspace submit-grid">
          <form className="panel run-form" onSubmit={submitRun}>
            <div className="section-title">
              <Send size={19} />
              <h2>Submit Run</h2>
            </div>

            <label>
              Player Name
              <input name="player" value={form.player} onChange={updateField} required />
            </label>

            <label>
              Game
              <input name="game" value={form.game} onChange={updateField} required />
            </label>

            <label>
              Category
              <input name="category" value={form.category} onChange={updateField} required />
            </label>

            <label>
              Time in Seconds
              <input
                min="1"
                max="36000"
                name="time"
                type="number"
                value={form.time}
                onChange={updateField}
                required
              />
            </label>

            <div className="segmented">
              <button
                className={videoMode === "url" ? "active" : ""}
                onClick={() => setVideoMode("url")}
                type="button"
              >
                <ExternalLink size={16} />
                URL
              </button>
              <button
                className={videoMode === "file" ? "active" : ""}
                onClick={() => setVideoMode("file")}
                type="button"
              >
                <FileVideo size={16} />
                Upload
              </button>
            </div>

            {videoMode === "url" ? (
              <label>
                Video URL
                <input
                  name="videoUrl"
                  type="url"
                  value={form.videoUrl}
                  onChange={updateField}
                  required
                />
              </label>
            ) : (
              <label>
                Video File
                <input
                  accept="video/*"
                  type="file"
                  onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                  required
                />
              </label>
            )}

            <button className="primary-action" disabled={submitting} type="submit">
              <CheckCircle2 size={18} />
              {submitting ? "Verifying..." : "Verify Run"}
            </button>
          </form>

          <aside className="panel live-panel">
            <div className="section-title">
              <Activity size={19} />
              <h2>Recent Chain Activity</h2>
            </div>
            {sortedRuns.slice(0, 4).map((run) => (
              <article className="compact-run" key={run.proofHash}>
                <strong>{run.player}</strong>
                <span>{run.game} - {run.category}</span>
                <small>Block {run.blockNumber || "pending"} · {formatTime(run.timeSeconds)}</small>
              </article>
            ))}
            {sortedRuns.length === 0 && <p className="empty-state">No verified runs yet.</p>}
          </aside>
        </section>
      ) : (
        <section className="workspace leaderboard">
          <div className="leaderboard-head">
            <div className="section-title">
              <Trophy size={19} />
              <h2>Leaderboard</h2>
            </div>
            <button className="icon-button" onClick={loadRuns} type="button" title="Refresh leaderboard">
              <RefreshCcw size={18} className={loadingRuns ? "spinning" : ""} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Category</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Block</th>
                  <th>Timestamp</th>
                  <th>Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.map((run, index) => (
                  <tr key={run.proofHash}>
                    <td>#{index + 1}</td>
                    <td>{run.player}</td>
                    <td>{run.game}</td>
                    <td>{run.category}</td>
                    <td>{formatTime(run.timeSeconds)}</td>
                    <td>
                      <span className="verified">
                        <CheckCircle2 size={16} />
                        Verified on Blockchain
                      </span>
                    </td>
                    <td>{run.blockNumber || "pending"}</td>
                    <td>
                      <span className="timestamp">
                        <Clock3 size={15} />
                        {formatDate(run.timestamp)}
                      </span>
                    </td>
                    <td>{shortenHash(run.transactionHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedRuns.length === 0 && <p className="empty-state">The leaderboard is waiting for its first verified run.</p>}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
