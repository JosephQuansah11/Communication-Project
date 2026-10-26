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
  const [fullscreen, setFullscreen] = useState(true);
  const [presenterView, setPresenterView] = useState(true);
  /** Custom show: the deck slide indexes to play; empty means every slide. */
  const [customShow, setCustomShow] = useState([]);
  const [screenNote, setScreenNote] = useState('');
  const [started, setStarted] = useState(false);
  const [liveInfo, setLiveInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const presenterWin = useRef(null);
  const outputWinRef = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'quandrion:live' && event.data.code) {
        setLiveInfo({ code: event.data.code, url: event.data.url });
      }
      if (event.data?.type === 'quandrion:presenter-ready') {
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

  const toggleShowSlide = (index) => {
    setCustomShow((current) =>
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index].sort((a, b) => a - b)
    );
  };

  /** A short caption for the custom-show picker (first text on the slide). */
  const slideLabel = (slide, index) => {
    const text = slide?.elements?.find((element) => element.text)?.text?.trim();
    return text ? text.slice(0, 48) : `Slide ${index + 1}`;
  };

  const start = () => {
    const screen = screens[selected] || screens[0];
    const primary = screens.find((entry) => entry.isPrimary) || screen;
    // Presenting on the display you are working on? Then both windows share it.
    const outputOnPrimary = Boolean(screen.isPrimary);
    const chromeOff = 'menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes';
    const showQuery =
      customShow.length && customShow.length < deck.slides.length
        ? `&show=${customShow.map((index) => index + 1).join(',')}`
        : '';

    /**
     * Slides-only mode: no presenter console. The selected display takes over and
     * shows the deck full screen — the single-monitor / mirror setup.
     */
    if (!presenterView) {
      const outputWin = window.open(
        `/present/${deck.id}?output=1&fs=1&live=${live ? '1' : '0'}${showQuery}`,
        `quandrion-output-${deck.id}`,
        `popup=yes,width=${screen.availWidth},height=${screen.availHeight},left=${screen.availLeft},top=${screen.availTop},${chromeOff}`
      );
      if (!outputWin) {
        setError('The presentation window was blocked. Allow pop-ups for this site and try again.');
        return;
      }
      outputWinRef.current = outputWin;
      try {
        outputWin.moveTo(screen.availLeft, screen.availTop);
        outputWin.resizeTo(screen.availWidth, screen.availHeight);
        outputWin.focus();
      } catch {
        /* cross-screen moves can be restricted */
      }
      setStarted(true);
      setLiveInfo(null);
      return;
    }

    // 1. Presenter console — always on the primary display, where you are editing.
    const consoleWidth = Math.max(720, Math.round(primary.availWidth * (outputOnPrimary ? 0.6 : 0.8)));
    const consoleHeight = Math.max(520, Math.round(primary.availHeight * 0.9));
    const consoleUrl = `/present/${deck.id}?live=${live ? '1' : '0'}&fill=${fillScreen ? '1' : '0'}&fs=0${showQuery}`;
    const consoleWin = window.open(
      consoleUrl,
      `quandrion-console-${deck.id}`,
      `popup=yes,width=${consoleWidth},height=${consoleHeight},left=${primary.availLeft + 12},top=${primary.availTop + 12},${chromeOff}`
    );
    if (!consoleWin) {
      setError('The presenter window was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    presenterWin.current = consoleWin;
    try {
      consoleWin.moveTo(primary.availLeft + 12, primary.availTop + 12);
      consoleWin.resizeTo(consoleWidth, consoleHeight);
    } catch {
      /* cross-screen moves can be restricted */
    }

    // 2. Audience output — the real show, on the display the audience is watching.
    //    When that is the primary display it opens as a windowed preview beside
    //    the console instead of covering it.
    const outputWidth = outputOnPrimary ? Math.max(360, Math.round(primary.availWidth * 0.34)) : screen.availWidth;
    const outputHeight = outputOnPrimary ? Math.round((outputWidth * 9) / 16) : screen.availHeight;
    const outputLeft = outputOnPrimary ? primary.availLeft + consoleWidth + 24 : screen.availLeft;
    const outputTop = outputOnPrimary ? primary.availTop + 12 : screen.availTop;
    const outputUrl = `/present/${deck.id}?output=1&fs=${!outputOnPrimary && fullscreen ? '1' : '0'}${showQuery}`;
    const outputWin = window.open(
      outputUrl,
      `quandrion-output-${deck.id}`,
      `popup=yes,width=${outputWidth},height=${outputHeight},left=${outputLeft},top=${outputTop},${chromeOff}`
    );
    if (outputWin) {
      outputWinRef.current = outputWin;
      try {
        outputWin.moveTo(outputLeft, outputTop);
        outputWin.resizeTo(outputWidth, outputHeight);
        outputWin.focus();
        consoleWin.focus();
      } catch {
        /* cross-screen moves can be restricted */
      }
      // Full screen is only safe when the output is not sharing the console display.
      if (fullscreen && !outputOnPrimary) {
        const enter = () => {
          try {
            outputWin.document?.documentElement?.requestFullscreen?.();
          } catch {
            /* the output window retries on its first click */
          }
        };
        setTimeout(enter, 350);
        setTimeout(enter, 900);
      }
    } else {
      setError('The audience output window was blocked. Allow pop-ups for this site and try again.');
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
                <h3><Icon name="monitor" size={19} /> Choose a display</h3>
                <button type="button" className="link-btn" onClick={detectScreens}>
                  <Icon name="search" size={17} /> Detect displays
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
                      <Icon name="monitor" size={34} />
                      {screen.isPrimary && <i className="primary-dot" />}
                    </span>
                    <span className="screen-meta">
                      <strong>{screen.label}</strong>
                      <small>{screen.availWidth} × {screen.availHeight} · {screen.isPrimary ? 'Primary' : 'Secondary'}</small>
                    </span>
                    {selected === index && <Icon name="check" size={19} className="check-icon" />}
                  </button>
                ))}
              </div>
              {screenNote ? (
                <p className="dialog-note">{screenNote}</p>
              ) : (
                <p className="dialog-note">Tip: allow display access to target a second monitor. Full screen is requested automatically.</p>
              )}
              <p className="dialog-note layout-note">
                <Icon name="monitor" size={16} />
                <span>
                  {(() => {
                    const screen = screens[selected] || screens[0];
                    const primary = screens.find((entry) => entry.isPrimary) || screen;
                    if (screens.length === 1) {
                      return `Mirror / duplicate mode: one display detected, so the slides take over ${screen.label} while the presenter controls stay in this window.`;
                    }
                    return screen.isPrimary
                      ? `Extend mode: the presenter console and a windowed preview of the audience output open together on ${primary.label} — move or resize them as you like.`
                      : `Extend mode: the presenter console (notes, controls, annotations, timer) stays on ${primary.label}, and the audience output takes over ${screen.label}.`;
                  })()}
                </span>
              </p>
            </div>

            <div className="dialog-section">
              <div className="dialog-section-head">
                <h3><Icon name="presentation" size={19} /> Set up show</h3>
              </div>
              <label className="toggle-card">
                <span>
                  <strong>Use presenter view</strong>
                  <small>
                    On: the console with notes, timer, annotations and controls opens on your display while the audience
                    screen shows only slides. Off: the slides take over the selected display, full screen, with no console.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={presenterView}
                  onChange={(event) => setPresenterView(event.target.checked)}
                />
                <i className="switch" />
              </label>
              <div className="field">
                <label>
                  Slides to show
                  <span className="field-value">
                    {customShow.length ? `${customShow.length} of ${deck.slides.length}` : 'All slides'}
                  </span>
                </label>
                <div className="row-gap">
                  <button
                    type="button"
                    className={`mini-btn ${customShow.length ? '' : 'on'}`}
                    onClick={() => setCustomShow([])}
                  >
                    All slides
                  </button>
                  <button
                    type="button"
                    className={`mini-btn ${customShow.length ? 'on' : ''}`}
                    onClick={() => setCustomShow((current) => (current.length ? current : deck.slides.map((_, i) => i)))}
                  >
                    Custom show…
                  </button>
                </div>
                {customShow.length > 0 && (
                  <div className="show-picker">
                    {deck.slides.map((slide, slideIndex) => (
                      <label
                        key={slide.id || slideIndex}
                        className={`show-picker-row${customShow.includes(slideIndex) ? ' on' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={customShow.includes(slideIndex)}
                          onChange={() => toggleShowSlide(slideIndex)}
                        />
                        <span className="show-picker-index">{slideIndex + 1}</span>
                        <span className="show-picker-title">{slideLabel(slide, slideIndex)}</span>
                      </label>
                    ))}
                  </div>
                )}
                <small className="field-hint">
                  A custom show plays only the slides you tick, in slide order — the deck itself is never changed.
                </small>
              </div>
            </div>

            <div className="dialog-section">
              <div className="dialog-section-head">
                <h3><Icon name="settings" size={19} /> Presenter options</h3>
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
                  <strong>Full screen presentation</strong>
                  <small>Opens the presenter without browser chrome and takes over the whole screen, like F11. Press F (or F11) to toggle it; Esc leaves full screen and stops presenting.</small>
                </span>
                <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
                <i className="switch" />
              </label>
              <label className="toggle-card">
                <span>
                  <strong>Fill the screen with content</strong>
                  <small>Scales slides to cover the full display. Leave off to letterbox while the background still fills the screen.</small>
                </span>
                <input type="checkbox" checked={fillScreen} onChange={(event) => setFillScreen(event.target.checked)} />
                <i className="switch" />
              </label>
            </div>

            {error && <p className="dialog-error"><Icon name="info" size={18} /> {error}</p>}

            <footer className="dialog-foot">
              <span className="dialog-hint">
                ← → navigate · B / W blank · G navigator · Ctrl+P pen · Ctrl+L laser · N notes · Esc stop
              </span>
              <button type="button" className="primary-btn large" onClick={start}>
                <Icon name="play" size={22} filled /> Start presenting
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="dialog-section started">
              <div className="started-badge"><Icon name="check" size={26} /></div>
              <h3>Presenter opened on {screens[selected]?.label || 'your display'}</h3>
              <p className="dialog-note">
                Two windows are running: the <strong>presenter console</strong> on your primary display and the
                <strong> audience output</strong> on the selected display. Both follow the same slide and animation step.
              </p>
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
                        <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copied' : 'Copy link'}
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
                  <Icon name="external" size={18} /> Focus presenter
                </button>
                <button type="button" className="ghost-btn" onClick={() => setStarted(false)}>
                  <Icon name="settings" size={18} /> Change display
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
