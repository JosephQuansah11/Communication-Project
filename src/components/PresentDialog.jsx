import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const fallbackScreen = () => ({
  label: 'This display',
  isPrimary: true,
  availLeft: window.screen.availLeft || 0,
  availTop: window.screen.availTop || 0,
  availWidth: window.screen.availWidth || window.innerWidth,
  availHeight: window.screen.availHeight || window.innerHeight,
  isInternal: false,
  screen: null,
});

export default function PresentDialog({ deck, onClose }) {
  const [screens, setScreens] = useState([fallbackScreen()]);
  const [selected, setSelected] = useState(0);
  const [live, setLive] = useState(true);
  const [fillScreen, setFillScreen] = useState(false);
  const [screenNote, setScreenNote] = useState('');
  const [started, setStarted] = useState(false);
  const [liveInfo, setLiveInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const presenterWin = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'slidesmith:live' && event.data.code) {
        setLiveInfo({ code: event.data.code, url: event.data.url });
      }
      if (event.data?.type === 'slidesmith:presenter-ready') {
        setStarted(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const detectScreens = async () => {
    setError('');
    if (!window.getScreenDetails) {
      setScreenNote('This browser does not expose multiple displays. Open the presenter window, then drag it to the display you want and press F for full screen.');
      return;
    }
    try {
      const details = await window.getScreenDetails();
      const list = details.screens.map((screen, index) => ({
        label: screen.label || `Display ${index + 1}`,
        isPrimary: screen.isPrimary,
        isInternal: screen.isInternal,
        availLeft: screen.availLeft,
        availTop: screen.availTop,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        screen,
      }));
      setScreens(list);
      const primaryIndex = list.findIndex((screen) => screen.isPrimary);
      setSelected(primaryIndex >= 0 ? primaryIndex : 0);
      setScreenNote(`Detected ${list.length} display${list.length === 1 ? '' : 's'}. Presenter opens on the selected screen.`);
    } catch (err) {
      setScreenNote('Display access was blocked. Allow window management for this site, or move the presenter window manually.');
    }
  };

  const start = () => {
    const screen = screens[selected] || screens[0];
    const width = screen.availWidth;
    const height = screen.availHeight;
    const left = screen.availLeft;
    const top = screen.availTop;
    const url = `/present/${deck.id}?live=${live ? '1' : '0'}&fill=${fillScreen ? '1' : '0'}`;
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
    const win = window.open(url, `slidesmith-presenter-${deck.id}`, features);
    if (!win) {
      setError('The presenter window was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    presenterWin.current = win;
    try {
      win.moveTo(left, top);
      win.resizeTo(width, height);
      win.focus();
    } catch {
      /* cross-screen moves can be restricted */
    }
    setStarted(true);
    setLiveInfo(null);
  };

  const copyLive = async () => {
    if (!liveInfo?.url) return;
    try {
      await navigator.clipboard.writeText(liveInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy — select the link manually.');
    }
  };


  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="present-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Present">
        <header className="dialog-head">
          <div>
            <span className="eyebrow">Present</span>
            <h2>{deck.title}</h2>
          </div>
          <button type="button" className="ghost-btn icon-only" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        {!started ? (
          <>
            <div className="dialog-section">
              <div className="dialog-section-head">
                <h3><Icon name="monitor" size={16} /> Choose a display</h3>
                <button type="button" className="link-btn" onClick={detectScreens}>
                  <Icon name="search" size={14} /> Detect displays
                </button>
              </div>
              <div className="screen-list">
                {screens.map((screen, index) => (
                  <button
                    type="button"
                    key={`${screen.label}-${index}`}
                    className={`screen-card ${selected === index ? 'selected' : ''}`}
                    onClick={() => setSelected(index)}
                  >
                    <span className="screen-visual">
                      <Icon name="monitor" size={28} />
                      {screen.isPrimary && <i className="primary-dot" />}
                    </span>
                    <span className="screen-meta">
                      <strong>{screen.label}</strong>
                      <small>{screen.availWidth} × {screen.availHeight} · {screen.isPrimary ? 'Primary' : 'Secondary'}</small>
                    </span>
                    {selected === index && <Icon name="check" size={16} className="check-icon" />}
                  </button>
                ))}
              </div>
              {screenNote ? (
                <p className="dialog-note">{screenNote}</p>
              ) : (
                <p className="dialog-note">Tip: allow display access to target a second monitor. Full screen is requested automatically.</p>
              )}
            </div>

            <div className="dialog-section">
              <div className="dialog-section-head">
                <h3><Icon name="settings" size={16} /> Presenter options</h3>
              </div>
              <label className="toggle-card">
                <span>
                  <strong>Live audience session</strong>
                  <small>Host a WebSocket room. Share the link shown in the presenter for real-time slide, table and cursor updates.</small>
                </span>
                <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
                <i className="switch" />
              </label>
              <label className="toggle-card">
                <span>
                  <strong>Fill the screen with content</strong>
                  <small>Scales slides to cover the full display. Leave off to letterbox while the background still fills the window.</small>
                </span>
                <input type="checkbox" checked={fillScreen} onChange={(event) => setFillScreen(event.target.checked)} />
                <i className="switch" />
              </label>
            </div>

            {error && <p className="dialog-error"><Icon name="info" size={15} /> {error}</p>}

            <footer className="dialog-foot">
              <span className="dialog-hint">← → navigate · B blackout · N notes · L live · Esc exit</span>
              <button type="button" className="primary-btn large" onClick={start}>
                <Icon name="play" size={18} filled /> Start presenting
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="dialog-section started">
              <div className="started-badge"><Icon name="check" size={22} /></div>
              <h3>Presenter opened on {screens[selected]?.label || 'your display'}</h3>
              <p className="dialog-note">
                {live ? 'Your live audience link is generated in the presenter window.' : 'Live audience is off for this session.'}
              </p>
              {live && (
                <div className="live-link-box">
                  {liveInfo ? (
                    <>
                      <div className="live-code">{liveInfo.code}</div>
                      <input readOnly value={liveInfo.url} onFocus={(event) => event.target.select()} />
                      <button type="button" className="primary-btn small" onClick={copyLive}>
                        <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy link'}
                      </button>
                    </>
                  ) : (
                    <div className="live-waiting">
                      <span className="pulse-dot" />
                      Waiting for the presenter to start the live room…
                    </div>
                  )}
                </div>
              )}
              <div className="row-gap">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    try {
                      presenterWin.current?.focus();
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <Icon name="external" size={15} /> Focus presenter
                </button>
                <button type="button" className="ghost-btn" onClick={() => setStarted(false)}>
                  <Icon name="settings" size={15} /> Change display
                </button>
              </div>
            </div>
            <footer className="dialog-foot">
              <span className="dialog-hint">Keep this tab open if you edit while presenting — updates sync to the audience.</span>
              <button type="button" className="primary-btn large" onClick={onClose}>Done</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
