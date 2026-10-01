import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Image as ImageIcon, FileText, ArrowRight, Activity, Terminal, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import './index.css';

function App() {
  const [mode, setMode] = useState(null);
  const [algorithm, setAlgorithm] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  
  const [flowchartData, setFlowchartData] = useState(null);
  const [expectedOutput, setExpectedOutput] = useState('');
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  const [variables, setVariables] = useState({});
  const [dryRunState, setDryRunState] = useState(null);

  // Connection Check
  const [backendConnected, setBackendConnected] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/ping`)
      .then(res => setBackendConnected(res.ok))
      .catch(() => setBackendConnected(false));
  }, [API_BASE_URL]);

  const [pendingFallback, setPendingFallback] = useState(null);

  const loadFallback = (customData) => {
    const data = customData || pendingFallback;
    if (!data) return;
    const initialVars = {};
    (data.variables || []).forEach(v => {
      initialVars[v.toLowerCase()] = 0;
    });
    setVariables(initialVars);
    setFlowchartData(data);
    setStatus('ℹ️ Demo flowchart loaded.');
    setPendingFallback(null);
  };

  const handleGenerate = async () => {
    if (!mode) return alert('Select an input mode first!');
    if (mode === 'text' && !algorithm.trim()) return alert('Please write an algorithm.');
    if (mode === 'image' && !file) return alert('Please upload an image.');

    setLoading(true);
    setError('');
    setStatus('⚙ Analyzing with AI...');
    setFlowchartData(null);
    setDryRunState(null);
    setPendingFallback(null);

    try {
      let res;
      if (mode === 'text') {
        res = await fetch(`${API_BASE_URL}/api/flowchart-from-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ algorithm })
        });
      } else {
        const formData = new FormData();
        formData.append('image', file);
        res = await fetch(`${API_BASE_URL}/api/flowchart-from-image`, {
          method: 'POST',
          body: formData
        });
      }

      const data = await res.json();
      if (!res.ok) {
        if (data.fallbackData) {
          setPendingFallback(data.fallbackData);
        }
        throw new Error(data.error || 'Server error.');
      }
      
      if (!data.nodes || !data.nodes.length) {
        throw new Error("No nodes found in AI response. Try a clearer image or rewrite the algorithm.");
      }

      const initialVars = {};
      (data.variables || []).forEach(v => {
        initialVars[v.toLowerCase()] = 0;
      });
      setVariables(initialVars);
      setFlowchartData(data);
      setStatus('✅ Flowchart ready!');
    } catch (err) {
      console.error(err);
      setError(err.message.includes('Failed to fetch') 
        ? 'Backend unreachable. Ensure server is running and accessible.' 
        : err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  // Dry Run Logic
  const startDryRun = () => {
    if (!flowchartData) return;
    if (!expectedOutput.trim()) {
      return alert('Please fill in the Expected Result to know if your flowchart is correct!');
    }
    
    const startNode = flowchartData.nodes.find(n => n.type === 'start');
    if (!startNode) return alert('No start node found in logic.');

    setDryRunState({
      running: true,
      currentNodeId: startNode.id,
      vars: { ...variables },
      steps: 0,
      history: [],
      finalOutput: [],
      message: '',
      complete: false
    });
  };

  const evalCondition = (text, vars) => {
    let expression = text.toLowerCase()
      .trim()
      .replace(/^if\s+/i, "")
      .replace(/\s+then$/i, "")
      .replace(/\s+is\s+/gi, " == ")
      .replace(/\?$/, "")
      .replace(/([^=!<>])=([^=!<>])/g, "$1==$2")
      .replace(/mod/gi, "%")
      .replace(/and/gi, "&&")
      .replace(/or/gi, "||");

    Object.keys(vars).sort((a,b)=>b.length - a.length).forEach(v => {
      expression = expression.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
    });
    try {
      return Function('"use strict"; return (' + expression + ')')();
    } catch(err) {
      console.error("Condition failed for:", text, expression, err);
      return false;
    }
  };

  const executeCode = (text, vars) => {
    let parts = text.split("=");
    if (parts.length < 2) return;
    let varName = parts[0].trim().toLowerCase();
    let expression = parts[1].trim();
    let mathExpression = expression.toLowerCase()
      .replace(/\/\//g, '/') // Treat // as normal division for JS
      .replace(/mod/gi, '%')
      .replace(/\^/g, '**');

    Object.keys(vars).sort((a,b)=>b.length - a.length).forEach(v => {
      mathExpression = mathExpression.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
    });
    try {
      let val = Function('"use strict"; return (' + mathExpression + ')')();
      
      // Pseudocode Integer Division Fix:
      // If a division results in a decimal, but the user is doing something like n = n / 10, 
      // they almost always mean Integer Division in pseudocode.
      if (typeof val === 'number' && !Number.isInteger(val)) {
        if (text.includes('/')) {
          val = Math.trunc(val); // Remove decimal part
        } else {
          val = Number(val.toFixed(4)); // Prevent floating point bloat
        }
      }
      
      vars[varName] = val;
    } catch(err) {
      console.error("Execute code failed for:", text, mathExpression, err);
    }
  };

  const extractOutput = (text, vars) => {
    const match = text.match(/\((.*?)\)/);
    let outExpr = match ? match[1].trim().toLowerCase() : text.toLowerCase().replace("output", "").replace("print", "").trim();
    
    if (vars[outExpr] !== undefined) {
      return vars[outExpr];
    }
    
    let evalExpr = outExpr;
    Object.keys(vars).sort((a,b)=>b.length - a.length).forEach(v => {
      evalExpr = evalExpr.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
    });
    try {
      return Function('"use strict"; return (' + evalExpr + ')')();
    } catch(err) {
      console.error("Output extraction failed for:", text, err);
      return outExpr;
    }
  };

  const getNextNodeId = (currentId, isTrue) => {
    const edges = flowchartData.edges.filter(e => e.from === currentId);
    if (!edges || edges.length === 0) return null;
    
    // If there's only one edge out, just take it (for non-decision blocks)
    if (edges.length === 1) return edges[0].to;

    // For decision blocks, match 'yes', 'true', 'no', 'false'
    const trueLabels = ['yes', 'true', 'y', 't'];
    const falseLabels = ['no', 'false', 'n', 'f'];

    let matchedEdge = null;
    if (isTrue === true) {
      matchedEdge = edges.find(e => e.label && trueLabels.includes(e.label.toString().toLowerCase().trim()));
    } else if (isTrue === false) {
      matchedEdge = edges.find(e => e.label && falseLabels.includes(e.label.toString().toLowerCase().trim()));
      // Fallback: If false, and couldn't find a 'no', pick the edge that is NOT the 'yes' edge.
      if (!matchedEdge) {
        matchedEdge = edges.find(e => !(e.label && trueLabels.includes(e.label.toString().toLowerCase().trim())));
      }
    }

    return matchedEdge ? matchedEdge.to : edges[0].to;
  };

  const executeNextStep = () => {
    if (!dryRunState || !dryRunState.running) return false;

    const node = flowchartData.nodes.find(n => n.id === dryRunState.currentNodeId);
    if (!node) return;

    let nextId = null;
    let newVars = { ...dryRunState.vars };
    let output = Array.isArray(dryRunState.finalOutput) ? [...dryRunState.finalOutput] : [];

    if (node.type === 'process') {
      executeCode(node.text, newVars);
      nextId = getNextNodeId(node.id, null);
    } else if (node.type === 'decision') {
      const isTrue = evalCondition(node.text, newVars);
      nextId = getNextNodeId(node.id, isTrue);
    } else if (node.type === 'output') {
      const outVal = extractOutput(node.text, newVars);
      if (outVal !== undefined && outVal !== null && outVal !== '') {
        output.push(outVal);
      }
      nextId = getNextNodeId(node.id, null);
    } else {
      nextId = getNextNodeId(node.id, null);
    }

    const stateUpdate = {
      vars: newVars,
      steps: dryRunState.steps + 1,
      finalOutput: output,
      currentNodeId: nextId
    };

    if (node.type === 'end' || !nextId) {
      stateUpdate.running = false;
      stateUpdate.complete = true;
      const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
      const actualStr = output.join(" ").toString().toLowerCase().replace(/\s+/g, ' ').trim();
      const actualDisp = output.join(" ");
      
      if (output.length === 0) {
        stateUpdate.message = '⚠ Ended with no output block triggered.';
      } else if (expectedStr !== '') {
        if (actualStr === expectedStr) {
          stateUpdate.message = `✅ YOUR FLOWCHART IS CORRECT! It yielded "${actualDisp}" as expected.`;
        } else {
          stateUpdate.message = `❌ FLOWCHART INCORRECT! It yielded "${actualDisp}", but you expected "${expectedOutput}".`;
        }
      } else {
        stateUpdate.message = `✅ Finish! Result: ${actualDisp} (No expected output was provided to check)`;
      }
    }

    setDryRunState(prevState => ({ ...prevState, ...stateUpdate }));
    return !stateUpdate.complete;
  };

  const fastForwardRun = async () => {
    if (!dryRunState || !dryRunState.running) return;
    
    let currentState = dryRunState;
    let safeGuard = 0;
    
    // We run it repeatedly without React state updates to avoid sluggish UI
    // then commit the final state at the end.
    while (currentState.running && safeGuard < 1500) {
      safeGuard++;
      const node = flowchartData.nodes.find(n => n.id === currentState.currentNodeId);
      if (!node) break;

      let nextId = null;
      let newVars = { ...currentState.vars };
      let output = Array.isArray(currentState.finalOutput) ? [...currentState.finalOutput] : [];

      if (node.type === 'process') {
        executeCode(node.text, newVars);
        nextId = getNextNodeId(node.id, null);
      } else if (node.type === 'decision') {
        const isTrue = evalCondition(node.text, newVars);
        nextId = getNextNodeId(node.id, isTrue);
      } else if (node.type === 'output') {
        const outVal = extractOutput(node.text, newVars);
        if (outVal !== undefined && outVal !== null && outVal !== '') {
          output.push(outVal);
        }
        nextId = getNextNodeId(node.id, null);
      } else {
        nextId = getNextNodeId(node.id, null);
      }

      const stateUpdate = {
        vars: newVars,
        steps: currentState.steps + 1,
        finalOutput: output,
        currentNodeId: nextId
      };

      if (node.type === 'end' || !nextId) {
        stateUpdate.running = false;
        stateUpdate.complete = true;
        const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const actualStr = output.join(" ").toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const actualDisp = output.join(" ");
        
        if (output.length === 0) {
          stateUpdate.message = '⚠ Ended with no explicit output.';
        } else if (expectedStr !== '') {
          if (actualStr === expectedStr) {
            stateUpdate.message = `✅ YOUR FLOWCHART IS CORRECT! It yielded "${actualDisp}" as expected.`;
          } else {
            stateUpdate.message = `❌ FLOWCHART INCORRECT! It yielded "${actualDisp}", but you expected "${expectedOutput}".`;
          }
        } else {
          stateUpdate.message = `✅ Finish! Result: ${actualDisp} (No expected output was provided)`;
        }
      }
      
      currentState = { ...currentState, ...stateUpdate };
    }
    
    if (safeGuard >= 1500) {
      currentState.running = false;
      currentState.complete = true;
      currentState.message = '🚨 Infinite Loop Detected (Exceeded 1500 steps). Logic is incorrect.';
    }

    setDryRunState(currentState);
  };

  const renderNode = (node) => {
    const isActive = dryRunState && dryRunState.currentNodeId === node.id;
    let classes = `node ${node.type} ${isActive ? 'active' : ''}`;

    return (
      <div key={node.id} className={classes} id={`node-${node.id}`}>
        <div className="node-type">{node.type.toUpperCase()}</div>
        <div className="node-text">{node.text}</div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Antigravity AI Flowchart</h1>
        <p>A reactive tutor that visualizes algorithms and dry-runs them.</p>
        {!backendConnected && (
          <div className="alert-red">
            <AlertTriangle size={18} /> Backend unreachable (Server is down or offline)
          </div>
        )}
      </header>

      <div className="content">
        <section className="card">
          <h2>1. Select Input</h2>
          <div className="mode-selector">
            <button className={mode === 'text' ? 'tab-active' : 'tab'} onClick={() => setMode('text')}>
              <FileText size={18}/> Write Algorithm
            </button>
            <button className={mode === 'image' ? 'tab-active' : 'tab'} onClick={() => setMode('image')}>
              <ImageIcon size={18}/> Upload Image
            </button>
          </div>

          <div className="input-area">
            {mode === 'text' && (
              <textarea 
                value={algorithm}
                onChange={e => setAlgorithm(e.target.value)}
                placeholder="1. Start\n2. sum = a + b\n3. If sum > 10 output 'yes'\n4. End"
              />
            )}
            {mode === 'image' && (
              <input type="file" onChange={e => setFile(e.target.files[0])} accept="image/*" />
            )}
          </div>

          <button className="primary-btn" onClick={handleGenerate} disabled={loading || !backendConnected}>
            {loading ? <Activity className="spin" size={20}/> : <Terminal size={20}/>}
            {loading ? 'Processing via AI...' : 'Generate Graph'}
          </button>

          {error && (
            <div className="error-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle size={18}/> <span>{error}</span>
              </div>
              {pendingFallback && (
                <button 
                  type="button"
                  style={{
                    padding: '0.45rem 0.9rem',
                    background: '#2563EB',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '0.85rem'
                  }}
                  onClick={() => loadFallback()}
                >
                  ▶ Load Demo Flowchart (Test Simulator)
                </button>
              )}
            </div>
          )}
          {status && <div className="success-box"><CheckCircle2 size={18}/> {status}</div>}
        </section>

        {flowchartData && (
          <div className="grid-2">
            <section className="card">
              <h2>2. Digital Flowchart</h2>
              <div className="canvas">
                {flowchartData.nodes.map(node => {
                  const edges = flowchartData.edges.filter(e => e.from === node.id);
                  return (
                    <React.Fragment key={node.id}>
                      {renderNode(node)}
                      {edges.map((edge, idx) => (
                        edge.label && edge.label.toLowerCase() !== 'null' ? (
                          <div key={`${edge.from}-${edge.to}-${idx}`} className="edge-label">
                            <span className="label-badge">{edge.label.toUpperCase()}</span>
                          </div>
                        ) : null
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <h2>3. Dry Run Simulation</h2>
              <div className="var-setup">
                <p>Define Variables:</p>
                {Object.keys(variables).map(v => (
                  <div key={v} className="var-input">
                    <label>{v}</label>
                    <input 
                      type="number" 
                      value={variables[v]} 
                      onChange={e => setVariables({...variables, [v]: parseFloat(e.target.value) || 0})}
                      disabled={dryRunState?.running}
                    />
                  </div>
                ))}

                <p style={{marginTop: '1rem'}}>Expected Result:</p>
                <input 
                  type="text" 
                  value={expectedOutput} 
                  onChange={e => setExpectedOutput(e.target.value)}
                  placeholder="E.g. 12, Yes, No..."
                  disabled={dryRunState?.running}
                  className="full-input"
                />
              </div>

              <div className="controls">
                <button className="btn-success" onClick={startDryRun}><Play size={16}/> Start New Run</button>
                <button className="btn-primary" onClick={executeNextStep} disabled={!dryRunState || !dryRunState.running}><ArrowRight size={16}/> Next Step</button>
                <button className="btn-primary" onClick={fastForwardRun} disabled={!dryRunState || !dryRunState.running} style={{background: '#8B5CF6'}}><Activity size={16}/> Fast Forward</button>
                <button className="btn-danger" onClick={() => setDryRunState(null)}><RotateCcw size={16}/> Reset</button>
              </div>

              {dryRunState && (
                <div className="state-panel">
                  <div className="stat">Step: <b>{dryRunState.steps}</b></div>
                  <div className="stat">Output: <b>{dryRunState.finalOutput && dryRunState.finalOutput.length > 0 ? dryRunState.finalOutput.join(" ") : 'None'}</b></div>
                  <div className="table-wrapper">
                    <table className="var-table">
                      <thead><tr><th>Var</th><th>Value</th></tr></thead>
                      <tbody>
                        {Object.entries(dryRunState.vars).map(([k,v]) => (
                          <tr key={k}><td>{k}</td><td>{v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dryRunState.complete && (
                    <div className="final-message">
                      {dryRunState.message}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
