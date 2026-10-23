import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('Slidesmith render error', error);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ color: '#fecaca', background: '#0b1120', padding: 24, whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById('root')).render(
    <Boundary>
      <App />
    </Boundary>
  );
} catch (error) {
  console.error(error);
}
