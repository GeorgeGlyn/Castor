/**
 * Castor AI Session & Run Report Exporter
 * Generates self-contained standalone HTML reports, GitHub-flavored Markdown,
 * and JSON telemetry archives with zero external runtime dependencies.
 */

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format timestamp into readable local string
 */
export function formatDateTime(ts) {
  const date = ts ? new Date(ts) : new Date();
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Generate GitHub-Flavored Markdown report
 */
export function generateMarkdownReport({ chat, project, artifacts = [] }) {
  const title = chat?.title || 'Castor Session';
  const projectName = project?.name || 'General Workspace';
  const projectPath = project?.path || 'N/A';
  const dateStr = formatDateTime(chat?.createdAt);
  const scratchpad = chat?.scratchpad;

  let md = `# 🦫 Castor AI Run Report: ${title}\n\n`;
  md += `**Project:** ${projectName} \`${projectPath}\`  \n`;
  md += `**Session Date:** ${dateStr}  \n`;
  md += `**Export Generated:** ${formatDateTime()}  \n\n`;

  // High-Level Goal
  if (scratchpad?.high_level_goal) {
    md += `## 🎯 High-Level Goal\n\n> ${scratchpad.high_level_goal.replace(/\n/g, '\n> ')}\n\n`;
  }

  // Execution Summary / Checklist
  if (scratchpad?.completed_steps?.length || scratchpad?.next_immediate_steps?.length) {
    md += `## 📋 Task Execution Roadmap\n\n`;
    if (scratchpad.completed_steps?.length) {
      md += `### Completed Milestones\n`;
      scratchpad.completed_steps.forEach((step) => {
        md += `- [x] ${step}\n`;
      });
      md += `\n`;
    }
    if (scratchpad.next_immediate_steps?.length) {
      md += `### Planned / Pending Steps\n`;
      scratchpad.next_immediate_steps.forEach((step) => {
        md += `- [ ] ${step}\n`;
      });
      md += `\n`;
    }
  }

  // Artifacts Summary
  if (artifacts && artifacts.length > 0) {
    md += `## 📦 Created Artifacts & Deliverables\n\n`;
    artifacts.forEach((art) => {
      md += `### ${art.title || art.id} (${art.type || 'document'})\n`;
      if (art.summary) {
        md += `*${art.summary}*\n\n`;
      }
      if (art.content) {
        const lang = art.type === 'code' ? 'javascript' : (art.type === 'diff' ? 'diff' : 'markdown');
        md += `\`\`\`${lang}\n${art.content.slice(0, 3000)}${art.content.length > 3000 ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
      }
    });
  }

  // Messages & Action Timeline
  md += `## 📜 Execution Timeline & Messages\n\n`;
  const msgs = chat?.messages || [];
  msgs.forEach((m, idx) => {
    const role = (m.role || 'system').toUpperCase();
    if (m.role === 'user') {
      md += `### 👤 User (Step ${idx + 1})\n${m.text}\n\n`;
    } else if (m.role === 'planner') {
      md += `### 🧠 Castor Planner (Step ${idx + 1})\n${m.text}\n\n`;
    } else if (m.role === 'diff') {
      md += `### 📝 Code Modification (Step ${idx + 1})\n\`\`\`diff\n${m.diff}\n\`\`\`\n\n`;
    } else if (m.role === 'visual_action') {
      md += `### 🎯 Visual Interaction (Step ${idx + 1}): ${(m.action || 'CLICK').toUpperCase()} '${m.target || 'Element'}'\n`;
      md += `- **Target Coordinates:** (${m.x}, ${m.y})\n`;
      if (m.bbox && m.bbox[2] > 0) md += `- **Element BBox:** ${m.bbox[2]}×${m.bbox[3]}px\n`;
      if (m.destination) md += `- **Drag Destination:** ${m.destination}\n`;
      md += `\n`;
    } else {
      md += `> **[${role}]**: ${m.text}\n\n`;
    }
  });

  md += `---\n*Generated autonomously by [Castor AI Assistant](https://github.com/GeorgeGlyn/Castor)*\n`;
  return md;
}

/**
 * Generate Self-Contained Standalone HTML Run Report
 */
export function generateHtmlReport({ chat, project, artifacts = [] }) {
  const title = chat?.title || 'Castor Session';
  const projectName = project?.name || 'General Workspace';
  const projectPath = project?.path || 'N/A';
  const dateStr = formatDateTime(chat?.createdAt);
  const exportTime = formatDateTime();
  const scratchpad = chat?.scratchpad;
  const messages = chat?.messages || [];

  const completedCount = scratchpad?.completed_steps?.length || 0;
  const pendingCount = scratchpad?.next_immediate_steps?.length || 0;
  const totalTasks = completedCount + pendingCount;
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100;

  // Render Completed Tasks HTML
  const completedHtml = (scratchpad?.completed_steps || [])
    .map(
      (s) => `
      <li class="task-item completed">
        <span class="icon-check">✓</span>
        <span>${escapeHtml(s)}</span>
      </li>`
    )
    .join('');

  // Render Pending Tasks HTML
  const pendingHtml = (scratchpad?.next_immediate_steps || [])
    .map(
      (s) => `
      <li class="task-item pending">
        <span class="icon-circle">○</span>
        <span>${escapeHtml(s)}</span>
      </li>`
    )
    .join('');

  // Render Timeline Messages HTML
  const timelineHtml = messages
    .map((m, idx) => {
      if (m.role === 'user') {
        return `
          <div class="timeline-card user-card">
            <div class="card-header">
              <span class="badge user-badge">USER PROMPT</span>
              <span class="card-time">#${idx + 1}</span>
            </div>
            <div class="card-body user-body">${escapeHtml(m.text)}</div>
          </div>`;
      }
      if (m.role === 'planner') {
        return `
          <div class="timeline-card planner-card">
            <details open class="thought-details">
              <summary class="card-header">
                <span class="badge planner-badge">🧠 AGENT THOUGHT &amp; PLAN</span>
                <span class="card-time">#${idx + 1}</span>
              </summary>
              <div class="card-body thought-body">${escapeHtml(m.text)}</div>
            </details>
          </div>`;
      }
      if (m.role === 'diff') {
        const diffLines = (m.diff || '')
          .split('\n')
          .map((line) => {
            const cls = line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : 'diff-neutral';
            return `<div class="diff-line ${cls}">${escapeHtml(line)}</div>`;
          })
          .join('');

        return `
          <div class="timeline-card diff-card">
            <div class="card-header">
              <span class="badge diff-badge">📝 CODE MODIFICATION DIFF</span>
              <span class="card-time">#${idx + 1}</span>
            </div>
            <div class="diff-container">${diffLines}</div>
          </div>`;
      }
      if (m.role === 'visual_action') {
        return `
          <div class="timeline-card visual-card">
            <div class="card-header">
              <span class="badge visual-badge">🎯 ${(m.action || 'CLICK').toUpperCase()}: ${escapeHtml(m.target || 'Element')}</span>
              <span class="card-time">(${m.x}, ${m.y})</span>
            </div>
            <div class="visual-body">
              ${m.crop ? `<img src="${m.crop}" alt="Target Element Crop" class="visual-crop-img" />` : ''}
              <div class="visual-info">
                <div class="visual-title">Target: <strong>${escapeHtml(m.target || '')}</strong></div>
                ${m.destination ? `<div class="visual-dest">Destination: <strong>${escapeHtml(m.destination)}</strong></div>` : ''}
                <div class="visual-meta">Screen Target: (${m.x}, ${m.y})${m.bbox && m.bbox[2] > 0 ? ` • Element BBox: ${m.bbox[2]}×${m.bbox[3]}px` : ''}</div>
              </div>
            </div>
          </div>`;
      }
      // System or status
      return `
        <div class="timeline-card system-card">
          <div class="card-body system-body">
            <span class="system-bullet">•</span>
            <span>${escapeHtml(m.text)}</span>
          </div>
        </div>`;
    })
    .join('');

  // Render Artifacts HTML
  const artifactsHtml = (artifacts || [])
    .map(
      (art) => `
      <div class="artifact-card">
        <div class="artifact-header">
          <div>
            <div class="artifact-title">${escapeHtml(art.title || art.id)}</div>
            <div class="artifact-meta">${escapeHtml(art.type || 'Document')} • ${escapeHtml(art.file_path || 'Virtual Artifact')}</div>
          </div>
          <span class="badge artifact-badge">${escapeHtml(art.type || 'Artifact')}</span>
        </div>
        ${art.summary ? `<div class="artifact-summary">${escapeHtml(art.summary)}</div>` : ''}
        ${
          art.content
            ? `<div class="artifact-preview"><pre><code>${escapeHtml(art.content.slice(0, 4000))}${art.content.length > 4000 ? '\n... [truncated preview]' : ''}</code></pre></div>`
            : ''
        }
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Castor AI Run Report - ${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #121216;
      --card-border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.25);
      --success: #10b981;
      --warning: #f59e0b;
      --diff-add-bg: rgba(16, 185, 129, 0.15);
      --diff-add-text: #34d399;
      --diff-del-bg: rgba(239, 68, 68, 0.15);
      --diff-del-text: #f87171;
    }

    @media print {
      body {
        background: #ffffff !important;
        color: #111827 !important;
      }
      .no-print {
        display: none !important;
      }
      .timeline-card, .artifact-card, .stat-card {
        border-color: #e5e7eb !important;
        background: #f9fafb !important;
        color: #111827 !important;
        break-inside: avoid;
      }
      .thought-body, .diff-container {
        background: #ffffff !important;
        color: #111827 !important;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 32px 20px;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
    }

    /* Top Action Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1.2rem;
      letter-spacing: -0.02em;
    }
    .brand-icon {
      font-size: 1.5rem;
    }
    .actions-group {
      display: flex;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      color: var(--text);
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #202026;
      border-color: var(--accent);
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .btn-primary:hover {
      background: #2563eb;
    }

    /* Header Banner */
    .header-banner {
      background: linear-gradient(135deg, #18181b 0%, #1e1b4b 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .report-title {
      font-size: 1.6rem;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .report-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
    }
    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      margin-top: 4px;
      color: #fff;
    }

    /* Section Styling */
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Task Roadmap List */
    .task-list {
      list-style: none;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .task-item {
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.9rem;
    }
    .task-item:last-child {
      border-bottom: none;
    }
    .task-item.completed {
      color: #e4e4e7;
    }
    .task-item.pending {
      color: var(--text-muted);
    }
    .icon-check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.2);
      color: var(--success);
      font-weight: bold;
      font-size: 0.75rem;
    }
    .icon-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px dashed var(--card-border);
      color: var(--text-muted);
      font-size: 0.7rem;
    }

    /* Timeline Cards */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .timeline-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .card-header {
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    }
    .badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.04em;
    }
    .user-badge {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .planner-badge {
      background: rgba(168, 85, 247, 0.2);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }
    .diff-badge {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .artifact-badge {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .visual-badge {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .visual-body {
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .visual-crop-img {
      width: 90px;
      height: 90px;
      object-fit: contain;
      background: #000;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      flex-shrink: 0;
    }
    .visual-info {
      font-size: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .visual-meta {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    .card-time {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .card-body {
      padding: 14px 18px;
      font-size: 0.9rem;
      white-space: pre-wrap;
    }
    .user-body {
      font-weight: 500;
      color: #f4f4f5;
    }
    .thought-body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.82rem;
      color: #d4d4d8;
      background: #09090b;
      line-height: 1.5;
    }
    .system-card {
      background: transparent;
      border: 1px dashed var(--card-border);
    }
    .system-body {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      color: var(--text-muted);
      padding: 8px 14px;
    }
    .system-bullet {
      color: var(--accent);
    }

    /* Diff View */
    .diff-container {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      background: #09090b;
      padding: 8px 0;
      overflow-x: auto;
    }
    .diff-line {
      padding: 1px 16px;
      white-space: pre;
    }
    .diff-add {
      background: var(--diff-add-bg);
      color: var(--diff-add-text);
    }
    .diff-del {
      background: var(--diff-del-bg);
      color: var(--diff-del-text);
    }
    .diff-neutral {
      color: #71717a;
    }

    /* Artifacts */
    .artifact-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 14px;
    }
    .artifact-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .artifact-title {
      font-weight: 700;
      font-size: 1rem;
    }
    .artifact-meta {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: monospace;
    }
    .artifact-summary {
      font-size: 0.85rem;
      color: #d4d4d8;
      margin-bottom: 12px;
    }
    .artifact-preview pre {
      background: #09090b;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, monospace;
      font-size: 0.8rem;
      color: #e4e4e7;
      overflow-x: auto;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--card-border);
      font-size: 0.8rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Action Bar -->
    <div class="top-bar no-print">
      <div class="brand">
        <span class="brand-icon">🦫</span>
        <span>Castor AI Run Report</span>
      </div>
      <div class="actions-group">
        <button class="btn" onclick="window.print()">
          <span>🖨️</span>
          <span>Print / Save PDF</span>
        </button>
      </div>
    </div>

    <!-- Header Banner -->
    <div class="header-banner">
      <h1 class="report-title">${escapeHtml(title)}</h1>
      <div class="report-meta">
        <div class="meta-item">📁 <span>${escapeHtml(projectName)}</span></div>
        <div class="meta-item">📍 <span>${escapeHtml(projectPath)}</span></div>
        <div class="meta-item">🕒 <span>${escapeHtml(dateStr)}</span></div>
        <div class="meta-item">📊 <span>${progressPct}% Completed</span></div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Milestones Completed</div>
        <div class="stat-value" style="color: var(--success);">${completedCount} / ${totalTasks}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Timeline Events</div>
        <div class="stat-value">${messages.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Living Artifacts</div>
        <div class="stat-value" style="color: var(--accent);">${artifacts?.length || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Generated At</div>
        <div class="stat-value" style="font-size: 1rem; margin-top: 10px; font-weight: normal; color: var(--text-muted);">${escapeHtml(exportTime)}</div>
      </div>
    </div>

    <!-- Roadmap & Tasks -->
    ${
      totalTasks > 0
        ? `
    <div class="section">
      <h2 class="section-title">📋 Task Execution Roadmap</h2>
      <ul class="task-list">
        ${completedHtml}
        ${pendingHtml}
      </ul>
    </div>`
        : ''
    }

    <!-- Artifacts -->
    ${
      artifacts?.length > 0
        ? `
    <div class="section">
      <h2 class="section-title">📦 Deliverables &amp; Artifacts</h2>
      <div>
        ${artifactsHtml}
      </div>
    </div>`
        : ''
    }

    <!-- Timeline & Events -->
    <div class="section">
      <h2 class="section-title">📜 Agent Execution Timeline</h2>
      <div class="timeline">
        ${timelineHtml}
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <p>Report exported by Castor Desktop AI Agent • <a href="https://github.com/GeorgeGlyn/Castor" style="color: var(--accent); text-decoration: none;">GitHub Repository</a></p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Download file helper in browser or trigger Electron save dialog
 */
export async function downloadFile({ filename, content, mimeType = 'text/plain', filters }) {
  if (window.electronAPI?.saveFile) {
    try {
      const res = await window.electronAPI.saveFile({
        defaultPath: filename,
        content,
        filters,
      });
      if (res?.success) return res;
    } catch (_) {}
  }

  // Web browser fallback
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { success: true };
}
