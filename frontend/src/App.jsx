import React, { useState, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  Image as ImageIcon,
  FileText,
  ArrowRight,
  Activity,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  LogOut,
  Lock,
  Mail,
  Clock,
  Sparkles,
  LogIn,
  UserPlus,
  X,
  History as HistoryIcon,
  Shield,
  Trash2,
  Search,
  ExternalLink,
  Edit2,
  Check
} from 'lucide-react';
import './index.css';

function App() {
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  // Authentication State
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('flowchart_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('flowchart_token') || '');
  const [isGuest, setIsGuest] = useState(false);

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Flowchart Workspace State
  const [mode, setMode] = useState(null);
  const [algorithm, setAlgorithm] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [flowchartData, setFlowchartData] = useState(null);
  const [expectedOutput, setExpectedOutput] = useState('');
  const [variables, setVariables] = useState({});
  const [dryRunState, setDryRunState] = useState(null);
  const [pendingFallback, setPendingFallback] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingNodeText, setEditingNodeText] = useState('');

  // User History State
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Admin Dashboard State
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [zoomedImage, setZoomedImage] = useState(null);

  // Connection Check
  const [backendConnected, setBackendConnected] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/ping`)
      .then(res => setBackendConnected(res.ok))
      .catch(() => setBackendConnected(false));
  }, [API_BASE_URL]);

  /* ================= AUTHENTICATION HANDLERS ================= */

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup' && !authName.trim()) {
      return setAuthError('Please enter your full name.');
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      return setAuthError('Please fill in both email and password.');
    }
    if (authPassword.length < 6) {
      return setAuthError('Password must be at least 6 characters long.');
    }

    setAuthLoading(true);
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload = authMode === 'signup' 
        ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
        : { email: authEmail.trim(), password: authPassword };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');

      localStorage.setItem('flowchart_token', data.token);
      localStorage.setItem('flowchart_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setIsGuest(false);
      setAuthPassword('');
      setAuthError('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('flowchart_token');
    localStorage.removeItem('flowchart_user');
    setUser(null);
    setToken('');
    setIsGuest(false);
    setFlowchartData(null);
    setDryRunState(null);
    setShowAdminModal(false);
    setShowHistory(false);
  };

  /* ================= USER HISTORY HANDLERS ================= */

  const fetchHistory = async () => {
    if (!token && !user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.history) {
        setHistoryItems(data.history);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryModal = () => {
    setShowHistory(true);
    fetchHistory();
  };

  const loadHistoricalFlowchart = (item) => {
    setupFlowchartVariables({
      nodes: item.nodes,
      edges: item.edges,
      variables: item.variables || []
    });
    setDryRunState(null);
    setStatus(`✅ Loaded saved flowchart from MongoDB (${item.inputType.toUpperCase()})`);
    setShowHistory(false);
    setShowAdminModal(false);
  };

  /* ================= ADMIN DASHBOARD HANDLERS ================= */

  const fetchAdminOverview = async () => {
    if (!token || !isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/overview`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminOverview(data);
      } else {
        alert(data.error || 'Failed to load admin data');
      }
    } catch (err) {
      console.error('Failed to load admin overview:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  const openAdminDashboard = () => {
    setShowAdminModal(true);
    fetchAdminOverview();
  };

  const handleDeleteFlowchart = async (id) => {
    if (!confirm('Are you sure you want to delete this flowchart from MongoDB?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/flowchart/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminOverview(prev => prev ? {
          ...prev,
          totalFlowcharts: prev.totalFlowcharts - 1,
          flowcharts: prev.flowcharts.filter(f => f._id !== id)
        } : null);
      } else {
        alert(data.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  /* ================= FLOWCHART GENERATION ================= */

  /* ================= VARIABLE ANALYSIS & SYNCHRONIZATION ================= */

  const analyzeVariables = (flowchart) => {
    if (!flowchart || !flowchart.nodes) {
      return { inputVars: [], processVars: [], initialVals: {} };
    }

    const inputVars = new Set();
    const processVars = new Set();
    const initialVals = {};

    flowchart.nodes.forEach(node => {
      const text = (node.text || '').trim();
      if (node.type === 'input') {
        const match = text.match(/\((.*?)\)/);
        const raw = match ? match[1] : text.replace(/input|read/gi, '');
        raw
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
          .forEach(v => inputVars.add(v));
      } else if (node.type === 'process') {
        let clean = text.replace(/^(let|set|int|var|float|const|initialize|init)\s+/i, '').trim();
        clean = clean.replace(/:=|<-/g, '=');
        const parts = clean.split('=');
        if (parts.length >= 2) {
          const v = parts[0].trim().toLowerCase();
          processVars.add(v);
          const rhs = parts.slice(1).join('=').trim();
          if (/^-?\d+(\.\d+)?$/.test(rhs)) {
            initialVals[v] = parseFloat(rhs);
          }
        } else if (clean.includes('+=')) {
          const v = clean.split('+=')[0].trim().toLowerCase();
          processVars.add(v);
        } else if (clean.match(/^([a-zA-Z_]\w*)\s*(\+\+|--)$/)) {
          const v = clean.match(/^([a-zA-Z_]\w*)/)[1].toLowerCase();
          processVars.add(v);
        }
      }
    });

    // Check if backend supplied variables
    (flowchart.variables || []).forEach(v => {
      const lower = v.toLowerCase().trim();
      if (!processVars.has(lower)) {
        inputVars.add(lower);
      }
    });

    return {
      inputVars: Array.from(inputVars),
      processVars: Array.from(processVars),
      initialVals
    };
  };

  const setupFlowchartVariables = (data) => {
    const analysis = analyzeVariables(data);
    const initialVars = {};

    // 1. Input variables default to 0
    analysis.inputVars.forEach(v => {
      initialVars[v] = variables[v] !== undefined ? variables[v] : 0;
    });

    // 2. Initial values from flowchart (e.g. i = 1, sum = 0)
    Object.keys(analysis.initialVals).forEach(v => {
      initialVars[v] = analysis.initialVals[v];
    });

    // 3. Fallback
    if (Object.keys(initialVars).length === 0 && data.variables?.length) {
      data.variables.forEach(v => {
        initialVars[v.toLowerCase().trim()] = 0;
      });
    }

    setVariables(initialVars);
    setFlowchartData(data);
  };

  const handleVariableChange = (varName, val) => {
    const numVal = parseFloat(val) || 0;
    setVariables(prev => ({ ...prev, [varName]: numVal }));

    // If this variable has an initialization node in flowchart (e.g. "i = 0" or "i = 1")
    // automatically sync the node text to match what the user defined!
    if (flowchartData && flowchartData.nodes) {
      const updatedNodes = flowchartData.nodes.map(node => {
        if (node.type === 'process') {
          const clean = node.text.replace(/^(let|set|int|var|float|const|initialize|init)\s+/i, '').trim();
          const parts = clean.split('=');
          if (parts.length >= 2 && parts[0].trim().toLowerCase() === varName) {
            const rhs = parts.slice(1).join('=').trim();
            if (/^-?\d+(\.\d+)?$/.test(rhs)) {
              return { ...node, text: `${varName} = ${numVal}` };
            }
          }
        }
        return node;
      });
      setFlowchartData(prev => ({ ...prev, nodes: updatedNodes }));
    }
  };

  /* ================= NODE EDITING HANDLERS ================= */

  const handleStartEditNode = (node, e) => {
    if (e) e.stopPropagation();
    setEditingNodeId(node.id);
    setEditingNodeText(node.text);
  };

  const handleSaveNodeEdit = (nodeId) => {
    if (!editingNodeText.trim()) return;
    const newText = editingNodeText.trim();

    const updatedNodes = flowchartData.nodes.map(n => {
      if (n.id === nodeId) {
        return { ...n, text: newText };
      }
      return n;
    });

    setFlowchartData(prev => ({ ...prev, nodes: updatedNodes }));
    setEditingNodeId(null);

    // If user edited an assignment (like i = 1), also sync variables!
    const clean = newText.replace(/^(let|set|int|var|float|const|initialize|init)\s+/i, '').trim();
    const parts = clean.split('=');
    if (parts.length >= 2) {
      const v = parts[0].trim().toLowerCase();
      const rhs = parts.slice(1).join('=').trim();
      if (/^-?\d+(\.\d+)?$/.test(rhs)) {
        setVariables(prev => ({ ...prev, [v]: parseFloat(rhs) }));
      }
    }
  };

  /* ================= FLOWCHART GENERATION ================= */

  const loadFallback = (customData) => {
    const data = customData || pendingFallback;
    if (!data) return;
    setupFlowchartVariables(data);
    setStatus('ℹ️ Demo flowchart loaded.');
    setPendingFallback(null);
  };

  const handleGenerate = async () => {
    if (!mode) return alert('Select an input mode first!');
    if (mode === 'text' && !algorithm.trim()) return alert('Please write an algorithm.');
    if (mode === 'image' && !file) return alert('Please upload an image.');

    setLoading(true);
    setError('');
    setStatus('⚙ Analyzing with AI & saving to MongoDB...');
    setFlowchartData(null);
    setDryRunState(null);
    setPendingFallback(null);

    try {
      let res;
      const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

      if (mode === 'text') {
        res = await fetch(`${API_BASE_URL}/api/flowchart-from-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            algorithm,
            userName: user?.name || 'Guest',
            userEmail: user?.email || ''
          })
        });
      } else {
        const formData = new FormData();
        formData.append('image', file);
        if (user?.name) formData.append('userName', user.name);
        if (user?.email) formData.append('userEmail', user.email);

        res = await fetch(`${API_BASE_URL}/api/flowchart-from-image`, {
          method: 'POST',
          headers: {
            ...authHeaders
          },
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
        throw new Error('No nodes found in AI response. Try a clearer image or rewrite the algorithm.');
      }

      setupFlowchartVariables(data);
      setStatus('✅ Flowchart ready & saved to MongoDB!');
    } catch (err) {
      console.error(err);
      setError(
        err.message.includes('Failed to fetch')
          ? 'Backend unreachable. Ensure server is running and accessible.'
          : err.message
      );
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  /* ================= DRY RUN SIMULATION ENGINE ================= */

  const startDryRun = () => {
    if (!flowchartData) return;
    if (!expectedOutput.trim()) {
      return alert('Please fill in the Expected Result to know if your flowchart is correct!');
    }

    const startNode = flowchartData.nodes.find(n => n.type === 'start');
    if (!startNode) return alert('No start node found in logic.');

    const currentVars = { ...variables };
    flowchartData.nodes.forEach(node => {
      if (node.type === 'process') {
        const clean = node.text.replace(/^(let|set|int|var|float|const|initialize|init)\s+/i, '').trim();
        const parts = clean.split('=');
        if (parts.length >= 2) {
          const v = parts[0].trim().toLowerCase();
          const rhs = parts.slice(1).join('=').trim();
          if (/^-?\d+(\.\d+)?$/.test(rhs) && currentVars[v] === undefined) {
            currentVars[v] = parseFloat(rhs);
          }
        }
      }
    });

    setDryRunState({
      running: true,
      currentNodeId: startNode.id,
      vars: currentVars,
      steps: 0,
      history: [],
      finalOutput: [],
      error: null,
      message: '',
      complete: false
    });
  };

  const evalCondition = (text, vars) => {
    if (!text) return { success: false, error: 'Empty decision condition' };

    let expression = text
      .toLowerCase()
      .trim()
      .replace(/^if\s+/i, '')
      .replace(/\s+then$/i, '')
      .replace(/\s+is\s+/gi, ' == ')
      .replace(/\?$/, '')
      .replace(/([^=!<>])=([^=!<>])/g, '$1==$2')
      .replace(/mod/gi, '%')
      .replace(/and/gi, '&&')
      .replace(/or/gi, '||');

    const tokens = expression.match(/[a-zA-Z_]\w*/g) || [];
    const reserved = new Set(['true', 'false', 'null', 'undefined', 'nan', 'math', 'abs']);

    for (const tok of tokens) {
      if (!reserved.has(tok) && vars[tok] === undefined) {
        return {
          success: false,
          error: `Variable Error in Decision ("${text}"): Variable '${tok}' is undefined or not initialized!`
        };
      }
    }

    Object.keys(vars)
      .sort((a, b) => b.length - a.length)
      .forEach(v => {
        expression = expression.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
      });

    try {
      const res = Function('"use strict"; return Boolean(' + expression + ')')();
      return { success: true, result: res };
    } catch (err) {
      console.error('Condition failed for:', text, expression, err);
      return {
        success: false,
        error: `Evaluation Error in Decision ("${text}"): ${err.message}`
      };
    }
  };

  const executeCode = (text, vars) => {
    if (!text) return { success: false, error: 'Empty process statement' };
    let clean = text.trim();

    // 1. Increment / Decrement: count++, i++, count--, i--
    const incMatch = clean.match(/^([a-zA-Z_]\w*)\s*(\+\+|--)$/);
    if (incMatch) {
      const v = incMatch[1].toLowerCase();
      if (vars[v] === undefined) {
        return {
          success: false,
          error: `Variable Error: Variable '${v}' is unassigned before '${text}'! Define it first.`
        };
      }
      vars[v] = incMatch[2] === '++' ? vars[v] + 1 : vars[v] - 1;
      return { success: true, value: vars[v] };
    }

    // 2. Compound assignment: i += 1, count += 1, i -= 1
    const compoundMatch = clean.match(/^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
    if (compoundMatch) {
      const v = compoundMatch[1].toLowerCase();
      const op = compoundMatch[2];
      const rhs = compoundMatch[3];

      if (vars[v] === undefined) {
        return {
          success: false,
          error: `Variable Error: Variable '${v}' must be initialized before using '${op}' in '${text}'!`
        };
      }
      clean = `${v} = ${v} ${op[0]} (${rhs})`;
    }

    // 3. Normalize assignment operators: := or <- or =
    clean = clean.replace(/:=|<-/g, '=');
    clean = clean.replace(/^(let|set|int|var|float|const|initialize|init)\s+/i, '');

    const parts = clean.split('=');
    if (parts.length < 2) {
      return {
        success: false,
        error: `Syntax Error in process node: "${text}" is not a valid assignment (e.g. "x = 5").`
      };
    }

    const varName = parts[0].trim().toLowerCase();
    const expression = parts.slice(1).join('=').trim();

    if (!/^[a-zA-Z_]\w*$/.test(varName)) {
      return {
        success: false,
        error: `Syntax Error: "${parts[0].trim()}" is not a valid variable name in "${text}".`
      };
    }

    let mathExpression = expression
      .toLowerCase()
      .replace(/\/\//g, '/')
      .replace(/mod/gi, '%')
      .replace(/\^/g, '**');

    const tokens = mathExpression.match(/[a-zA-Z_]\w*/g) || [];
    const reserved = new Set([
      'math', 'trunc', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'pow',
      'mod', 'true', 'false', 'pi', 'e', 'nan', 'infinity'
    ]);

    for (const tok of tokens) {
      if (!reserved.has(tok) && vars[tok] === undefined) {
        return {
          success: false,
          error: `Variable Error: Variable '${tok}' is used in "${text}" but was never assigned a value!`
        };
      }
    }

    // Check for division by zero
    if (mathExpression.includes('/') || mathExpression.includes('%')) {
      const divMatch = mathExpression.match(/[\/%]\s*([a-zA-Z_]\w*|\d+(\.\d+)?)/);
      if (divMatch) {
        const denom = divMatch[1];
        if (denom === '0' || vars[denom] === 0) {
          return {
            success: false,
            error: `Math Error: Division by zero in "${text}" (denominator '${denom}' is 0)!`
          };
        }
      }
    }

    Object.keys(vars)
      .sort((a, b) => b.length - a.length)
      .forEach(v => {
        mathExpression = mathExpression.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
      });

    try {
      let val = Function('"use strict"; return (' + mathExpression + ')')();

      if (val === Infinity || val === -Infinity || Number.isNaN(val)) {
        return {
          success: false,
          error: `Math Error in "${text}": Result is ${val} (Invalid number or division by zero)!`
        };
      }

      if (typeof val === 'number' && !Number.isInteger(val)) {
        if (text.includes('/')) {
          val = Math.trunc(val);
        } else {
          val = Number(val.toFixed(4));
        }
      }

      vars[varName] = val;
      return { success: true, value: val };
    } catch (err) {
      console.error('Execute code failed for:', text, mathExpression, err);
      return {
        success: false,
        error: `Execution Error in "${text}": ${err.message}`
      };
    }
  };

  const extractOutput = (text, vars) => {
    if (!text) return { success: false, error: 'Empty output statement' };

    const match = text.match(/\((.*?)\)/);
    let outExpr = match
      ? match[1].trim()
      : text.replace(/^output\s*:?/i, '').replace(/^print\s*:?/i, '').trim();

    const lowerExpr = outExpr.toLowerCase();

    // If it's a quoted literal, e.g. "Yes" or 'NO'
    if (/^["'].*["']$/.test(outExpr)) {
      return { success: true, output: outExpr.slice(1, -1) };
    }

    // If it's a single variable
    if (/^[a-zA-Z_]\w*$/.test(lowerExpr)) {
      if (vars[lowerExpr] === undefined) {
        return {
          success: false,
          error: `Variable Error in Output ("${text}"): Variable '${outExpr}' was never assigned a value!`
        };
      }
      return { success: true, output: vars[lowerExpr] };
    }

    let evalExpr = lowerExpr;
    const tokens = evalExpr.match(/[a-zA-Z_]\w*/g) || [];
    const reserved = new Set(['true', 'false', 'math']);

    for (const tok of tokens) {
      if (!reserved.has(tok) && vars[tok] === undefined) {
        return {
          success: false,
          error: `Variable Error in Output ("${text}"): Variable '${tok}' is unassigned!`
        };
      }
    }

    Object.keys(vars)
      .sort((a, b) => b.length - a.length)
      .forEach(v => {
        evalExpr = evalExpr.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${vars[v]})`);
      });

    try {
      const val = Function('"use strict"; return (' + evalExpr + ')')();
      return { success: true, output: val };
    } catch (err) {
      console.error('Output extraction failed for:', text, err);
      return { success: false, error: `Output Error in "${text}": ${err.message}` };
    }
  };

  const getNextNodeId = (currentId, isTrue) => {
    const edges = flowchartData.edges.filter(e => e.from === currentId);
    if (!edges || edges.length === 0) return null;

    if (edges.length === 1) return edges[0].to;

    const trueLabels = ['yes', 'true', 'y', 't'];
    const falseLabels = ['no', 'false', 'n', 'f'];

    let matchedEdge = null;
    if (isTrue === true) {
      matchedEdge = edges.find(
        e => e.label && trueLabels.includes(e.label.toString().toLowerCase().trim())
      );
    } else if (isTrue === false) {
      matchedEdge = edges.find(
        e => e.label && falseLabels.includes(e.label.toString().toLowerCase().trim())
      );
      if (!matchedEdge) {
        matchedEdge = edges.find(
          e => !(e.label && trueLabels.includes(e.label.toString().toLowerCase().trim()))
        );
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
    let stepError = null;

    if (node.type === 'process') {
      const res = executeCode(node.text, newVars);
      if (!res.success) {
        stepError = res.error;
      } else {
        nextId = getNextNodeId(node.id, null);
      }
    } else if (node.type === 'decision') {
      const res = evalCondition(node.text, newVars);
      if (!res.success) {
        stepError = res.error;
      } else {
        nextId = getNextNodeId(node.id, res.result);
      }
    } else if (node.type === 'output') {
      const res = extractOutput(node.text, newVars);
      if (!res.success) {
        stepError = res.error;
      } else {
        if (res.output !== undefined && res.output !== null && res.output !== '') {
          output.push(res.output);
        }
        nextId = getNextNodeId(node.id, null);
      }
    } else if (node.type === 'input') {
      const match = node.text.match(/\((.*?)\)/);
      const rawVars = match ? match[1] : node.text.replace(/input|read/gi, '');
      const varList = rawVars.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const v of varList) {
        if (newVars[v] === undefined || Number.isNaN(newVars[v])) {
          stepError = `Input Error in "${node.text}": Variable '${v}' has not been assigned in Define Variables!`;
          break;
        }
      }
      if (!stepError) {
        nextId = getNextNodeId(node.id, null);
      }
    } else {
      nextId = getNextNodeId(node.id, null);
    }

    const stateUpdate = {
      vars: newVars,
      steps: dryRunState.steps + 1,
      finalOutput: output,
      currentNodeId: nextId,
      error: stepError
    };

    if (stepError) {
      stateUpdate.running = false;
      stateUpdate.complete = true;
      const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
      if (expectedStr === 'error' || expectedStr.includes('error')) {
        stateUpdate.message = `✅ YOUR FLOWCHART IS CORRECT! It yielded an error as expected: "${stepError}".`;
      } else {
        stateUpdate.message = `❌ ${stepError}`;
      }
      setDryRunState(prevState => ({ ...prevState, ...stateUpdate }));
      return false;
    }

    if (node.type === 'end' || !nextId) {
      stateUpdate.running = false;
      stateUpdate.complete = true;
      const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
      const actualStr = output.join(' ').toString().toLowerCase().replace(/\s+/g, ' ').trim();
      const actualDisp = output.join(' ');

      if (expectedStr === 'error' || expectedStr.includes('error')) {
        stateUpdate.message = `❌ FLOWCHART INCORRECT! It yielded "${actualDisp}", but you expected an error.`;
      } else if (output.length === 0) {
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

    while (currentState.running && safeGuard < 1500) {
      safeGuard++;
      const node = flowchartData.nodes.find(n => n.id === currentState.currentNodeId);
      if (!node) break;

      let nextId = null;
      let newVars = { ...currentState.vars };
      let output = Array.isArray(currentState.finalOutput) ? [...currentState.finalOutput] : [];
      let stepError = null;

      if (node.type === 'process') {
        const res = executeCode(node.text, newVars);
        if (!res.success) {
          stepError = res.error;
        } else {
          nextId = getNextNodeId(node.id, null);
        }
      } else if (node.type === 'decision') {
        const res = evalCondition(node.text, newVars);
        if (!res.success) {
          stepError = res.error;
        } else {
          nextId = getNextNodeId(node.id, res.result);
        }
      } else if (node.type === 'output') {
        const res = extractOutput(node.text, newVars);
        if (!res.success) {
          stepError = res.error;
        } else {
          if (res.output !== undefined && res.output !== null && res.output !== '') {
            output.push(res.output);
          }
          nextId = getNextNodeId(node.id, null);
        }
      } else if (node.type === 'input') {
        const match = node.text.match(/\((.*?)\)/);
        const rawVars = match ? match[1] : node.text.replace(/input|read/gi, '');
        const varList = rawVars.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        for (const v of varList) {
          if (newVars[v] === undefined || Number.isNaN(newVars[v])) {
            stepError = `Input Error in "${node.text}": Variable '${v}' has not been assigned in Define Variables!`;
            break;
          }
        }
        if (!stepError) {
          nextId = getNextNodeId(node.id, null);
        }
      } else {
        nextId = getNextNodeId(node.id, null);
      }

      const stateUpdate = {
        vars: newVars,
        steps: currentState.steps + 1,
        finalOutput: output,
        currentNodeId: nextId,
        error: stepError
      };

      if (stepError) {
        stateUpdate.running = false;
        stateUpdate.complete = true;
        const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
        if (expectedStr === 'error' || expectedStr.includes('error')) {
          stateUpdate.message = `✅ YOUR FLOWCHART IS CORRECT! It yielded an error as expected: "${stepError}".`;
        } else {
          stateUpdate.message = `❌ ${stepError}`;
        }
        currentState = { ...currentState, ...stateUpdate };
        break;
      }

      if (node.type === 'end' || !nextId) {
        stateUpdate.running = false;
        stateUpdate.complete = true;
        const expectedStr = expectedOutput.toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const actualStr = output.join(' ').toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const actualDisp = output.join(' ');

        if (expectedStr === 'error' || expectedStr.includes('error')) {
          stateUpdate.message = `❌ FLOWCHART INCORRECT! It yielded "${actualDisp}", but you expected an error.`;
        } else if (output.length === 0) {
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

    if (safeGuard >= 1500 && !currentState.error) {
      currentState.running = false;
      currentState.complete = true;
      currentState.message = '🚨 Infinite Loop Detected (Exceeded 1500 steps). Logic is incorrect.';
    }

    setDryRunState(currentState);
  };

  const renderNode = (node) => {
    const isActive = dryRunState && dryRunState.currentNodeId === node.id;
    const isError = dryRunState && dryRunState.error && dryRunState.currentNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    let classes = `node ${node.type} ${isActive ? 'active' : ''} ${isError ? 'has-error' : ''}`;

    return (
      <div key={node.id} className={classes} id={`node-${node.id}`}>
        <div className="node-header">
          <div className="node-type">{node.type.toUpperCase()}</div>
          {!isEditing && !dryRunState?.running && (
            <button
              type="button"
              className="node-edit-btn"
              title="Click to edit node text"
              onClick={(e) => handleStartEditNode(node, e)}
            >
              <Edit2 size={12} />
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="node-edit-wrapper" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="node-edit-input"
              value={editingNodeText}
              onChange={(e) => setEditingNodeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNodeEdit(node.id);
                if (e.key === 'Escape') setEditingNodeId(null);
              }}
              autoFocus
            />
            <div className="node-edit-actions">
              <button
                type="button"
                className="btn-edit-save"
                onClick={() => handleSaveNodeEdit(node.id)}
                title="Save changes"
              >
                <Check size={14} /> Save
              </button>
              <button
                type="button"
                className="btn-edit-cancel"
                onClick={() => setEditingNodeId(null)}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="node-text" onDoubleClick={(e) => !dryRunState?.running && handleStartEditNode(node, e)}>
            {node.text}
          </div>
        )}
      </div>
    );
  };

  /* ================= RENDER: AUTHENTICATION PORTAL ================= */

  if (!user && !isGuest) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon-circle">
              <Sparkles size={30} />
            </div>
            <h1>Antigravity AI Flowchart</h1>
            <p>Log in or sign up to save your flowcharts to MongoDB and dry-run algorithms.</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              <LogIn size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('signup');
                setAuthError('');
              }}
            >
              <UserPlus size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Create Account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <div className="input-field-group">
                <label>Full Name</label>
                <div className="input-with-icon">
                  <User size={18} />
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="input-field-group">
              <label>Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-field-group">
              <label>Password</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {authError && (
              <div className="error-box">
                <XCircle size={18} /> <span>{authError}</span>
              </div>
            )}

            <button type="submit" className="primary-btn" disabled={authLoading}>
              {authLoading ? (
                <Activity className="spin" size={20} />
              ) : authMode === 'signup' ? (
                'Create Account & Enter'
              ) : (
                'Sign In & Enter'
              )}
            </button>
          </form>

          <div className="guest-divider">OR</div>

          <button
            type="button"
            className="guest-btn"
            onClick={() => setIsGuest(true)}
          >
            🚀 Continue as Guest (Skip for now)
          </button>
        </div>
      </div>
    );
  }

  // Filtered flowcharts for Admin
  const filteredAdminFlowcharts = (adminOverview?.flowcharts || []).filter(item => {
    if (!adminSearch.trim()) return true;
    const query = adminSearch.toLowerCase();
    return (
      (item.userName && item.userName.toLowerCase().includes(query)) ||
      (item.userEmail && item.userEmail.toLowerCase().includes(query)) ||
      (item.imageFileName && item.imageFileName.toLowerCase().includes(query)) ||
      (item.algorithm && item.algorithm.toLowerCase().includes(query))
    );
  });

  /* ================= RENDER: MAIN APPLICATION ================= */

  return (
    <div className="app-container">
      {/* TOP NAVIGATION BAR */}
      <nav className="top-navbar">
        <div className="brand-section">
          <div className="brand-logo">
            <Sparkles size={20} />
          </div>
          <div className="brand-text">
            <h2>Antigravity AI Flowchart</h2>
            <span className="brand-badge">● Active Cloud Studio</span>
          </div>
        </div>

        <div className="user-nav-actions">
          {user ? (
            <>
              <div className="user-pill" title={user.email}>
                <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
                <span>{user.name}</span>
                {isAdmin && <span className="admin-header-badge">ADMIN</span>}
              </div>

              {/* ADMIN DASHBOARD BUTTON */}
              {isAdmin && (
                <button className="btn-nav btn-admin" onClick={openAdminDashboard}>
                  <Shield size={16} /> 👑 Admin Panel
                </button>
              )}

              <button className="btn-nav" onClick={openHistoryModal}>
                <HistoryIcon size={16} /> My History
              </button>
              <button className="btn-nav btn-logout" onClick={handleLogout}>
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <>
              <div className="user-pill">
                <User size={14} /> <span>Guest Mode</span>
              </div>
              <button className="btn-nav" onClick={() => setIsGuest(false)}>
                <LogIn size={16} /> Sign In
              </button>
            </>
          )}
        </div>
      </nav>

      {/* HEADER BANNER */}
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
        {/* INPUT CARD */}
        <section className="card">
          <h2>1. Select Input</h2>
          <div className="mode-selector">
            <button className={mode === 'text' ? 'tab-active' : 'tab'} onClick={() => setMode('text')}>
              <FileText size={18} /> Write Algorithm
            </button>
            <button className={mode === 'image' ? 'tab-active' : 'tab'} onClick={() => setMode('image')}>
              <ImageIcon size={18} /> Upload Image
            </button>
          </div>

          <div className="input-area">
            {mode === 'text' && (
              <textarea
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                placeholder="1. Start&#10;2. sum = a + b&#10;3. If sum > 10 output 'yes'&#10;4. End"
              />
            )}
            {mode === 'image' && (
              <input type="file" onChange={(e) => setFile(e.target.files[0])} accept="image/*" />
            )}
          </div>

          <button className="primary-btn" onClick={handleGenerate} disabled={loading || !backendConnected}>
            {loading ? <Activity className="spin" size={20} /> : <Terminal size={20} />}
            {loading ? 'Processing via AI...' : 'Generate Graph'}
          </button>

          {error && (
            <div className="error-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle size={18} /> <span>{error}</span>
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
          {status && <div className="success-box"><CheckCircle2 size={18} /> {status}</div>}
        </section>

        {/* WORKSPACE & SIMULATOR */}
        {flowchartData && (
          <div className="grid-2">
            <section className="card">
              <h2>2. Digital Flowchart</h2>
              <div className="canvas">
                {flowchartData.nodes.map((node) => {
                  const edges = flowchartData.edges.filter((e) => e.from === node.id);
                  return (
                    <React.Fragment key={node.id}>
                      {renderNode(node)}
                      {edges.map((edge, idx) =>
                        edge.label && edge.label.toLowerCase() !== 'null' ? (
                          <div key={`${edge.from}-${edge.to}-${idx}`} className="edge-label">
                            <span className="label-badge">{edge.label.toUpperCase()}</span>
                          </div>
                        ) : null
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <h2>3. Dry Run Simulation</h2>
              <div className="var-setup">
                <p style={{ fontWeight: 600, marginBottom: '0.6rem' }}>Define Variables:</p>
                {(() => {
                  const analysis = analyzeVariables(flowchartData);
                  return (
                    <>
                      {/* 1. INPUT VARIABLES (required inputs like a, b, N) */}
                      {analysis.inputVars.length > 0 && (
                        <div className="var-section">
                          <span className="var-section-tag input-tag">📥 Input Variables (Enter Values):</span>
                          {analysis.inputVars.map((v) => (
                            <div key={v} className="var-input">
                              <label>{v}</label>
                              <input
                                type="number"
                                value={variables[v] !== undefined ? variables[v] : ''}
                                placeholder="0"
                                onChange={(e) => handleVariableChange(v, e.target.value)}
                                disabled={dryRunState?.running}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 2. INITIALIZED LOOP / STATE VARIABLES (e.g. i = 1, sum = 0) */}
                      {Object.keys(analysis.initialVals).length > 0 && (
                        <div className="var-section" style={{ marginTop: '0.6rem' }}>
                          <span className="var-section-tag init-tag">🔢 Initial Values (Syncs with Flowchart):</span>
                          {Object.keys(analysis.initialVals).map((v) => (
                            <div key={v} className="var-input">
                              <label>
                                {v}{' '}
                                <small style={{ color: 'var(--text-muted)' }}>
                                  (Initial: {analysis.initialVals[v]})
                                </small>
                              </label>
                              <input
                                type="number"
                                value={variables[v] !== undefined ? variables[v] : analysis.initialVals[v]}
                                onChange={(e) => handleVariableChange(v, e.target.value)}
                                disabled={dryRunState?.running}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 3. CALCULATED VARIABLES (mul, div, add, etc.) */}
                      {analysis.processVars.filter(v => analysis.initialVals[v] === undefined).length > 0 && (
                        <div className="var-computed-info">
                          <span>⚙️ Calculated during simulation:</span>
                          <div className="computed-pills">
                            {analysis.processVars
                              .filter(v => analysis.initialVals[v] === undefined)
                              .map(v => (
                                <span key={v} className="computed-pill">{v}</span>
                              ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                <p style={{ marginTop: '1.25rem', fontWeight: 600 }}>Expected Result:</p>
                <input
                  type="text"
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  placeholder="E.g. 1 2 3 4, 8 2 6, or 'error'..."
                  disabled={dryRunState?.running}
                  className="full-input"
                />
              </div>

              <div className="controls">
                <button className="btn-success" onClick={startDryRun}>
                  <Play size={16} /> Start New Run
                </button>
                <button className="btn-primary" onClick={executeNextStep} disabled={!dryRunState || !dryRunState.running}>
                  <ArrowRight size={16} /> Next Step
                </button>
                <button
                  className="btn-primary"
                  onClick={fastForwardRun}
                  disabled={!dryRunState || !dryRunState.running}
                  style={{ background: '#8B5CF6' }}
                >
                  <Activity size={16} /> Fast Forward
                </button>
                <button className="btn-danger" onClick={() => setDryRunState(null)}>
                  <RotateCcw size={16} /> Reset
                </button>
              </div>

              {dryRunState && (
                <div className="state-panel">
                  {dryRunState.error && (
                    <div className="state-error-banner">
                      <AlertTriangle size={20} />
                      <div className="state-error-text">
                        <strong>Runtime Error Detected:</strong>
                        <p>{dryRunState.error}</p>
                      </div>
                    </div>
                  )}

                  <div className="stat">
                    Step: <b>{dryRunState.steps}</b>
                  </div>
                  <div className="stat">
                    Output:{' '}
                    <b>
                      {dryRunState.finalOutput && dryRunState.finalOutput.length > 0
                        ? dryRunState.finalOutput.join(' ')
                        : 'None'}
                    </b>
                  </div>
                  <div className="table-wrapper">
                    <table className="var-table">
                      <thead>
                        <tr>
                          <th>Var</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(dryRunState.vars).map(([k, v]) => (
                          <tr key={k}>
                            <td>{k}</td>
                            <td style={{ color: Number.isNaN(v) || v === null ? '#EF4444' : 'inherit' }}>
                              {v !== undefined ? String(v) : '<unassigned>'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dryRunState.complete && (
                    <div className={`final-message ${dryRunState.error ? 'has-error' : ''}`}>
                      {dryRunState.message}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* USER HISTORY MODAL */}
      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <HistoryIcon size={20} /> My Saved Flowcharts ({historyItems.length})
              </h3>
              <button className="modal-close-btn" onClick={() => setShowHistory(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <Activity className="spin" size={24} style={{ margin: '0 auto 0.5rem' }} />
                  <p>Loading flowcharts from MongoDB...</p>
                </div>
              ) : historyItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <Clock size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p>No saved flowcharts found yet. Generate a flowchart from an image or text to save it to MongoDB!</p>
                </div>
              ) : (
                historyItems.map((item) => (
                  <div key={item._id} className="history-card">
                    <div className="history-info">
                      <h4>
                        {item.inputType === 'image'
                          ? `🖼️ ${item.imageFileName || 'Uploaded Image'}`
                          : `📝 ${item.algorithm ? item.algorithm.substring(0, 40) + '...' : 'Algorithm Text'}`}
                      </h4>
                      <div className="history-meta">
                        <span className={`history-badge ${item.inputType}`}>
                          {item.inputType}
                        </span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        <span>• {item.nodes?.length || 0} Nodes</span>
                      </div>
                    </div>
                    <button
                      className="history-load-btn"
                      onClick={() => loadHistoricalFlowchart(item)}
                    >
                      Load into Canvas
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN CONTROL PANEL MODAL */}
      {showAdminModal && (
        <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Shield size={22} color="#FBBF24" /> 👑 Admin Control Panel
                <span className="admin-header-badge">Full Database Access</span>
              </h3>
              <button className="modal-close-btn" onClick={() => setShowAdminModal(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Admin Stats Bar */}
            <div className="admin-stats-bar">
              <div className="admin-stat-card">
                <div className="admin-stat-icon users">👥</div>
                <div className="admin-stat-info">
                  <h5>Total Users</h5>
                  <span>{adminOverview?.totalUsers || 0}</span>
                </div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-icon flowcharts">📊</div>
                <div className="admin-stat-info">
                  <h5>Total Uploads</h5>
                  <span>{adminOverview?.totalFlowcharts || 0}</span>
                </div>
              </div>
            </div>

            {/* Admin Search Bar */}
            <div className="admin-search-wrapper">
              <Search size={18} color="var(--text-muted)" style={{ alignSelf: 'center' }} />
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search uploads by User Name, Email, or File Name..."
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />
            </div>

            {/* Admin Records List */}
            <div className="modal-body" style={{ padding: '0', maxHeight: '60vh' }}>
              {adminLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Activity className="spin" size={26} style={{ margin: '0 auto 0.5rem' }} />
                  <p>Loading database records from MongoDB...</p>
                </div>
              ) : filteredAdminFlowcharts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <p>No flowchart uploads match your search.</p>
                </div>
              ) : (
                <table className="admin-records-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Upload Date</th>
                      <th>Type & Content</th>
                      <th>Uploaded Image</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminFlowcharts.map((item) => (
                      <tr key={item._id}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-avatar">
                              {(item.userName || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="admin-user-text">
                              <strong>{item.userName || 'Anonymous'}</strong>
                              <span>{item.userEmail || 'No Email'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span className={`history-badge ${item.inputType}`}>
                              {item.inputType}
                            </span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {item.inputType === 'image' 
                                ? item.imageFileName || 'Image Upload'
                                : (item.algorithm ? item.algorithm.substring(0, 35) + '...' : 'Algorithm')}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#10B981' }}>
                              {item.nodes?.length || 0} Nodes
                            </span>
                          </div>
                        </td>
                        <td>
                          {item.imageData ? (
                            <div 
                              className="admin-thumbnail-wrapper"
                              title="Click to view full image"
                              onClick={() => setZoomedImage(item.imageData)}
                            >
                              <img src={item.imageData} alt="Flowchart" className="admin-thumbnail-img" />
                            </div>
                          ) : item.inputType === 'image' ? (
                            <div className="admin-thumbnail-wrapper">
                              <span className="admin-no-img">🖼️ {item.imageFileName || 'Photo'}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Text Algorithm</span>
                          )}
                        </td>
                        <td>
                          <div className="admin-actions-cell">
                            <button
                              className="btn-admin-action btn-admin-load"
                              onClick={() => loadHistoricalFlowchart(item)}
                              title="Load this flowchart into the main canvas"
                            >
                              <ExternalLink size={14} /> Open
                            </button>
                            <button
                              className="btn-admin-action btn-admin-delete"
                              onClick={() => handleDeleteFlowchart(item._id)}
                              title="Delete from MongoDB"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FULL-SIZE IMAGE ZOOM OVERLAY */}
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <div className="image-zoom-box" onClick={(e) => e.stopPropagation()}>
            <button className="image-zoom-close" onClick={() => setZoomedImage(null)}>
              <X size={20} />
            </button>
            <img src={zoomedImage} alt="Uploaded Flowchart Full View" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
