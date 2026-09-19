/* Static interaction prototype. No API calls, credentials, or business-data storage. */
(() => {
  'use strict';
  const config = window.TASKTIPS_DESIGN;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const readPref = (key, fallback) => { try { return localStorage.getItem(`tasktips-design-${key}`) || fallback; } catch { return fallback; } };
  const writePref = (key, value) => { try { localStorage.setItem(`tasktips-design-${key}`, value); } catch { /* File previews can deny storage. */ } };
  let theme = readPref('theme', 'system');
  const media = matchMedia('(prefers-color-scheme: dark)');
  function setTheme(value) {
    theme = value;
    document.documentElement.dataset.theme = value === 'system' ? (media.matches ? 'dark' : 'light') : value;
    writePref('theme', value);
    $$('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setTheme === value)));
  }
  setTheme(theme);
  $$('[data-editor-pref]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.editorPref === readPref('editor', 'instant'))));
  media.addEventListener('change', () => { if (theme === 'system') setTheme(theme); });
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }

  const dialog = $('#app-dialog');
  let dialogCallback;
  let dialogReturnFocus;
  function openDialog(title, body, { confirm = '确认', cancel = '取消', danger = false, onConfirm = null, noFooter = false } = {}) {
    dialogReturnFocus = document.activeElement;
    $('#dialog-title').textContent = title;
    $('#dialog-content').innerHTML = `<form id="dialog-form"><div class="dialog-body">${body}</div>${noFooter ? '' : `<div class="dialog-footer"><button type="button" class="btn" data-action="close-dialog">${cancel}</button><button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${confirm}</button></div>`}</form>`;
    dialogCallback = onConfirm;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => ($('input,textarea,select', dialog) || $('[data-action="close-dialog"]', dialog)).focus());
  }
  function closeDialog() { dialog.close(); }
  dialog.addEventListener('close', () => { if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) closeDialog(); } });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    const callback = dialogCallback;
    const result = callback?.(new FormData(event.target));
    if (result !== false) closeDialog();
  });
  const inputField = (label, value = '', name = 'name', extra = '') => `<div class="field"><label for="modal-${name}">${label}</label><input id="modal-${name}" name="${name}" value="${esc(value)}" required ${extra}></div>`;
  const colors = ['#8a8a8a','#f97066','#fb923c','#fbbf24','#6ccb5f','#6ee7b7','#4a9eff','#a78bfa','#e05299','#ff8fab','#c084fc','#818cf8','#38bdf8','#22d3ee','#34d399','#a3e635','#f97316','#ef4444','#dc2626','#b91c1c','#d97706','#ca8a04','#65a30d','#15803d','#0284c7','#1d4ed8','#4338ca','#7c3aed','#9d174d','#be123c','#0f766e','#475569'];
  function colorPicker() {
    return `<div class="field"><label>颜色</label><div class="flex wrap" style="gap:10px">${colors.map((c, i) => `<button type="button" class="color-swatch" data-color="${c}" style="background:${c}" aria-label="颜色 ${c}" aria-pressed="${i === 6}"></button>`).join('')}</div></div>`;
  }
  const operations = {
    'new-folder': ['新建目录', `${inputField('目录名称', '', 'name', 'minlength="2" maxlength="50" placeholder="例如：个人生活"')}<div class="field"><label for="folder-parent">父目录</label><select id="folder-parent" name="parent"><option>根目录</option><option>产品设计</option><option>个人生活</option><option>阅读清单</option></select></div>${colorPicker()}`, '创建目录'],
    'new-tag': ['新建标签', `${inputField('标签名称', '', 'name', 'maxlength="20" placeholder="例如：灵感"')}<div class="field"><label for="tag-group">分组</label><select id="tag-group" name="group"><option>其他</option><option>属性</option></select></div>${colorPicker()}`, '创建标签'],
    'new-group': ['新建标签分组', inputField('分组名称', '', 'name', 'maxlength="20" placeholder="例如：项目"'), '创建分组'],
    'new-project': ['新建项目', `<p>为一类事情建立独立的空间，项目之间的内容不会混合。</p>${inputField('项目名称', '', 'name', 'maxlength="128" placeholder="例如：阅读与学习"')}`, '创建并进入'],
  };
  function createEntity(action) {
    const [title, body, confirm] = operations[action];
    openDialog(title, body, { confirm, onConfirm: (data) => {
      const name = String(data.get('name') || '').trim();
      if (!name || (action === 'new-folder' && (name.length < 2 || /[/\\:*?"<>|]/.test(name)))) { toast('请输入符合规则的名称'); return false; }
      if (action === 'new-project') { location.href = 'onboarding.html'; return; }
      const feedback = document.createElement('div');
      feedback.className = 'notice success mt';
      feedback.textContent = `已创建${action === 'new-folder' ? '目录' : action === 'new-tag' ? '标签' : '分组'}“${name}”`;
      $('.content')?.prepend(feedback);
      toast(`已创建“${name}” · 仅在本次设计预览中显示`);
    } });
  }

  let filter = { category: params.get('category') || '', tag: params.get('tag') || '', priority: '', mode: 'and', due: '' };
  function applyFilters() {
    const term = ($('[data-list-search]')?.value || '').trim().toLowerCase();
    let visible = 0;
    $$('[data-list-content] .task-row').forEach((row) => {
      const tags = filter.tag.split(',').map((x) => x.trim()).filter(Boolean);
      const matches = (tag) => row.dataset.tag.toLowerCase() === tag.toLowerCase();
      const tagMatch = !tags.length || (filter.mode === 'exclude' ? !tags.some(matches) : filter.mode === 'or' ? tags.some(matches) : tags.every(matches));
      const dueMatch = !filter.due || (filter.due === 'today' ? row.dataset.date === '09-18' : filter.due === 'none' ? !row.dataset.date : row.dataset.date && row.dataset.date < '09-18');
      const show = (!term || row.textContent.toLowerCase().includes(term)) && (!filter.category || row.dataset.category === filter.category) && tagMatch && (!filter.priority || row.dataset.priority === filter.priority) && dueMatch;
      row.hidden = !show;
      if (show) visible++;
    });
    $$('[data-list-content] .list-group').forEach((g) => { g.hidden = !$$('.task-row', g).some((r) => !r.hidden); });
    const empty = $('[data-search-empty]');
    if (empty) empty.hidden = visible > 0;
    const counter = $('[data-filter-count]');
    if (counter) { const count = Object.entries(filter).filter(([k,v]) => k !== 'mode' && v).length; counter.hidden = !count; counter.textContent = `${count} 项筛选 · ${visible} 条任务`; }
  }
  $('[data-list-search]')?.addEventListener('input', applyFilters);
  if ($('[data-list-content]')) applyFilters();
  function openFilter() {
    openDialog('筛选任务', `<div class="two-col"><div class="field"><label for="filter-category">目录</label><select name="category" id="filter-category"><option value="">全部目录</option> ${['产品设计','个人生活','阅读清单','未分类'].map((x) => `<option ${filter.category === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label for="filter-priority">优先级</label><select name="priority" id="filter-priority"><option value="">不限</option>${['无','低','中','高'].map((x,i) => `<option value="${i}" ${filter.priority === String(i) ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div><div class="field"><label for="filter-tags">标签</label><input name="tag" id="filter-tags" value="${esc(filter.tag)}" placeholder="例如：工作, 生活"><small>多个标签用英文逗号分隔。</small></div><div class="two-col"><div class="field"><label for="filter-mode">标签匹配方式</label><select name="mode" id="filter-mode"><option value="and">全部包含</option><option value="or">任一包含</option><option value="exclude">均不包含</option></select></div><div class="field"><label for="filter-due">截止日期</label><select name="due" id="filter-due"><option value="">不限</option><option value="today">今天到期</option><option value="overdue">已过期</option><option value="none">无日期</option></select></div></div>`, { confirm: '应用筛选', onConfirm: (data) => { filter = Object.fromEntries(data.entries()); applyFilters(); } });
    $('#filter-mode').value = filter.mode;
    $('#filter-due').value = filter.due;
  }

  let markdown = config.sampleMarkdown;
  const instant = $('#instant-editor');
  const source = $('#source-editor');
  const preview = $('#markdown-preview');
  let editHistory = [markdown], historyIndex = 0, composing = false, queuedMode, saveTimer;
  let syncingScroll = true, scrollGuard = false;
  function inline(text) {
    return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function renderMarkdown(text) {
    let html = '', list = '', fence = false, code = [];
    const closeList = () => { if (list) { html += `</${list}>`; list = ''; } };
    for (const line of text.split('\n')) {
      if (line.startsWith('```')) { closeList(); if (fence) { html += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = []; } fence = !fence; continue; }
      if (fence) { code.push(line); continue; }
      const task = line.match(/^[-*] \[([ xX])\] (.*)$/);
      const bullet = line.match(/^[-*] (.*)$/);
      const ordered = line.match(/^\d+\. (.*)$/);
      if (task || bullet || ordered) {
        const type = ordered ? 'ol' : 'ul';
        if (list !== type) { closeList(); html += `<${type} ${task ? 'class="check-list"' : ''}>`; list = type; }
        html += task ? `<li><input type="checkbox" class="task-check" aria-label="${esc(task[2])}" ${task[1].toLowerCase() === 'x' ? 'checked' : ''}>${inline(task[2])}</li>` : `<li>${inline((bullet || ordered)[1])}</li>`;
        continue;
      }
      closeList();
      if (!line.trim()) continue;
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      else if (/^---+$/.test(line)) html += '<hr>';
      else if (line.startsWith('> ')) html += `<blockquote>${inline(line.slice(2))}</blockquote>`;
      else html += `<p>${inline(line)}</p>`;
    }
    closeList();
    if (fence) html += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
    return html;
  }
  function serialize(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const children = [...node.childNodes].map(serialize).join('');
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${children}\n\n`;
    if (['p','div'].includes(tag)) return `${children}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${children}**`;
    if (tag === 'em' || tag === 'i') return `*${children}*`;
    if (tag === 's' || tag === 'del') return `~~${children}~~`;
    if (tag === 'hr') return '---\n\n';
    if (tag === 'blockquote') return `> ${children.trim()}\n\n`;
    if (tag === 'pre') return `\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
    if (tag === 'code') return `\`${children}\``;
    if (tag === 'input') return '';
    if (tag === 'li') {
      const checkbox = $('input[type="checkbox"]', node);
      const prefix = checkbox ? `- [${checkbox.checked ? 'x' : ' '}] ` : node.parentElement.tagName === 'OL' ? `${[...node.parentElement.children].indexOf(node)+1}. ` : '- ';
      return `${prefix}${children.trim()}\n`;
    }
    if (tag === 'ul' || tag === 'ol') return `${children}\n`;
    return children;
  }
  function renderEditor() {
    if (!source) return;
    source.value = markdown;
    instant.innerHTML = renderMarkdown(markdown);
    preview.innerHTML = renderMarkdown(markdown);
    $$('input', preview).forEach((input) => { input.disabled = true; });
    if (params.get('state') === 'readonly') $$('input', instant).forEach((input) => { input.disabled = true; });
    $('#word-count').textContent = `${markdown.length} 字符`;
  }
  function saveFeedback() {
    if (!instant || ['save-error','readonly'].includes(params.get('state'))) return;
    const label = $('.save-state');
    label.textContent = '正在保存…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { label.textContent = '已保存到本机'; }, 400);
  }
  function recordEdit(value) {
    if (params.get('state') === 'readonly') return;
    if (value === markdown) return;
    markdown = value;
    editHistory = editHistory.slice(0, historyIndex + 1);
    editHistory.push(value);
    if (editHistory.length > 100) editHistory.shift();
    historyIndex = editHistory.length - 1;
    $('#word-count').textContent = `${markdown.length} 字符`;
    saveFeedback();
  }
  function changeMode(mode) {
    if (!instant) return;
    if (composing) { queuedMode = mode; return; }
    const isSplit = mode === 'split';
    const position = { x: instant.scrollLeft, y: instant.scrollTop, start: source.selectionStart, end: source.selectionEnd, sourceY: source.scrollTop };
    renderEditor();
    instant.hidden = isSplit;
    $('#split-editor').hidden = !isSplit;
    $('.split-mobile-tabs').hidden = !isSplit;
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    instant.scrollTop = position.y; instant.scrollLeft = position.x;
    source.setSelectionRange(position.start, position.end); source.scrollTop = position.sourceY;
  }
  function undo(redo = false) {
    if (params.get('state') === 'readonly') return;
    const next = historyIndex + (redo ? 1 : -1);
    if (next < 0 || next >= editHistory.length) { toast(redo ? '没有可以重做的修改' : '没有可以撤销的修改'); return; }
    historyIndex = next; markdown = editHistory[next]; renderEditor(); saveFeedback();
  }
  if (instant) {
    const task = config.tasks.find((t) => t.id === params.get('task'));
    if (params.has('new')) markdown = '';
    else if (task && task.id !== 'design') markdown = `# ${task.title}\n\n${task.description}\n\n## 下一步\n\n- [ ] 记下一个具体的行动\n`;
    editHistory = [markdown]; renderEditor();
    if (params.has('new')) {
      $$('.editor-meta .meta-chip:not([data-action="complete-current"])').forEach((b, i) => { if (i === 0 && params.get('from') !== 'today') b.lastChild.textContent = '截止日期'; if (i === 1) { b.lastChild.textContent = '无优先级'; b.classList.remove('red'); } if (i === 2) b.lastChild.textContent = '未分类'; if (i === 3) b.lastChild.textContent = '添加标签'; });
    }
    instant.addEventListener('input', () => { if (!composing) recordEdit([...instant.childNodes].map(serialize).join('')); });
    instant.addEventListener('change', () => recordEdit([...instant.childNodes].map(serialize).join('')));
    source.addEventListener('input', () => { if (!composing) { recordEdit(source.value); preview.innerHTML = renderMarkdown(markdown); $$('input',preview).forEach((i) => { i.disabled = true; }); } });
    [instant,source].forEach((el) => { el.addEventListener('compositionstart', () => { composing = true; }); el.addEventListener('compositionend', () => { composing = false; recordEdit(el === source ? source.value : [...instant.childNodes].map(serialize).join('')); if (queuedMode) { changeMode(queuedMode); queuedMode = null; } }); });
    [source,preview].forEach((el) => el.addEventListener('scroll', () => { if (!syncingScroll || scrollGuard) return; const target = el === source ? preview : source; const max = el.scrollHeight - el.clientHeight; scrollGuard = true; target.scrollTop = max > 0 ? el.scrollTop / max * (target.scrollHeight - target.clientHeight) : 0; requestAnimationFrame(() => { scrollGuard = false; }); }));
    const divider = $('.split-divider');
    function setRatio(value) { const ratio = Math.max(30, Math.min(70, value)); $('.source-pane').style.width = `${ratio}%`; $('.preview-pane').style.width = `${100-ratio}%`; divider.setAttribute('aria-valuenow', String(Math.round(ratio))); }
    divider.addEventListener('pointerdown', (e) => { e.preventDefault(); divider.setPointerCapture(e.pointerId); });
    divider.addEventListener('pointermove', (e) => { if (!divider.hasPointerCapture(e.pointerId)) return; const rect = $('#split-editor').getBoundingClientRect(); setRatio((e.clientX - rect.left) / rect.width * 100); });
    divider.addEventListener('pointerup', (e) => { if (divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId); });
    divider.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setRatio(Number(divider.getAttribute('aria-valuenow')) + (e.key === 'ArrowLeft' ? -5 : 5)); } });
  }

  function setBanner(message, kind = '', link = '') {
    let box = $('#state-banner');
    if (!box) { box = document.createElement('div'); const container = $('.auth-form') || $('.project-content') || $('.loading-card'); container?.prepend(box); }
    box.hidden = false;
    box.innerHTML = `<div class="notice state-banner ${kind}"><span class="grow">${message}</span>${link}</div>`;
  }
  function syncStatus(state) {
    const labels = {
      normal: ['所有更改已同步', '上次同步：刚刚 · 我的任务', '已连接', 'green', 0, 0],
      offline: ['离线更改已保留在本机', '联网后会继续同步，已下载的内容可以继续编辑', '离线', 'amber', 2, 0],
      syncing: ['正在同步你的更改…', '已处理 3 / 5 项，其他操作不受影响', '同步中', 'blue', 2, 0],
      conflict: ['有 1 个冲突需要处理', '确认保留的版本后，这项内容才能继续同步', '等待选择', 'amber', 1, 1],
      partial: ['部分更改未能同步', '1 张图片超过 10 MiB，请调整后重新导入', '部分失败', 'amber', 1, 0],
      maintenance: ['项目维护中，已暂停同步', '本机的 2 项修改已保留，维护结束后自动重试', '维护中', 'amber', 2, 0],
      'auth-error': ['请登录后继续同步', '本机的 2 项修改已保留，登录后恢复同步', '登录失效', 'amber', 2, 0],
    };
    const info = labels[state];
    if (!info) return;
    const side = $('.sidebar-sync');
    if (side) { side.innerHTML = `<span class="dot"></span>${info[0]}`; side.style.color = `var(--${info[3] === 'blue' ? 'brand' : info[3]})`; }
    const title = $('#sync-status-title');
    if (!title) return;
    title.textContent = info[0];
    $('#sync-status-description').textContent = info[1];
    const status = title.closest('.panel-body'), badge = $('.pill', status), symbol = $('.feature-icon', status);
    badge.textContent = info[2]; badge.className = `pill ${info[3]}`;
    symbol.style.color = `var(--${info[3] === 'blue' ? 'brand' : info[3]})`;
    symbol.style.background = `var(--${info[3] === 'blue' ? 'brand' : info[3]}-soft)`;
    symbol.textContent = state === 'normal' ? '✓' : state === 'syncing' ? '↻' : '!';
    $$('.stat-card .value').slice(0,2).forEach((el,i) => { el.textContent = info[i+4]; });
    const details = $$('.stat-card p');
    details[0].textContent = info[4] ? '本机修改等待同步' : '本机内容已提交';
    details[1].textContent = info[5] ? '需要确认保留的版本' : '没有待处理的冲突';
    $('[data-action="sync-now"]').disabled = ['offline','syncing','maintenance','auth-error','conflict','partial'].includes(state);
  }
  function applyState(state) {
    if (state === 'normal') return;
    const banners = {
      offline:['当前处于离线状态。已下载的内容可以继续编辑，联网后会自动同步。','warning'],
      error:['暂时无法完成请求，你的本地内容仍然保留。请稍后重试。','danger',`<a class="btn" href="${config.page}.html">重新尝试</a>`],
      'save-error':['本地存储空间不足，当前修改尚未保存。请保留页面并导出正文。','danger','<button class="btn" data-action="export-markdown">导出正文</button>'],
      readonly:['这条任务正在另一个标签页中编辑。当前页面为只读。','warning'],
      conflict:['另一台设备也修改了内容，有 1 个冲突需要你处理。','warning','<a class="btn" href="conflicts.html">查看冲突</a>'],
      partial:['部分内容未能同步：1 张图片超过大小限制。其余更改已同步。','warning'],
      maintenance:['项目正在维护，暂时无法同步。本机修改会继续保留。','warning'],
      'auth-error':['登录已失效，请重新登录。本地尚未同步的内容会保留。','warning','<a class="btn" href="login.html">重新登录</a>'],
      'restore-conflict':['无法恢复“产品设计”：已有同名目录。请先重命名现有目录。','warning'],
      'version-changed':['远端版本再次发生变化，请刷新比较结果后重新选择。','warning','<a class="btn" href="conflicts.html">刷新比较</a>'],
      'account-disabled':['账号已被禁用，已暂停编辑与同步。请联系管理员。','danger'],
      quota:['存储空间不足。请先导出未同步内容，再清理不需要的恢复副本。','danger'],
      corrupt:['发现 1 份无法解析的内容，已保留原始副本。相关内容暂时只读。','warning'],
    };
    if (banners[state] && !(state === 'auth-error' && config.page === 'login')) setBanner(...banners[state]);
    syncStatus(state);
    if (state === 'invalid-invitation') { $('#auth-error').hidden = false; $('#auth-error').textContent = '邀请无效、已使用或已过期，请联系管理员获取新的邀请。'; }
    if (state === 'auth-error' && config.page === 'login') { $('#auth-error').hidden = false; $('#auth-error').textContent = '邮箱或密码不正确，请检查后重试。'; }
    if (state === 'offline' && ['login','register','onboarding','devices','snapshots','restore'].includes(config.page)) {
      setBanner('此操作需要联网。已下载的任务仍可离线打开。','warning','<a class="btn" href="today.html?state=offline">打开本地任务</a>');
      $$('form button[type="submit"], [data-action="finish-init"]').forEach((b) => { b.disabled = true; });
    }
    if (state === 'readonly' && instant) { instant.contentEditable = 'false'; source.readOnly = true; $$('.format-toolbar button,.editor-meta button,[data-action="undo"],[data-action="editor-more"]').forEach((b) => { b.disabled = true; }); }
    if (state === 'save-error' && $('.editor-footer')) $('.editor-footer').lastElementChild.textContent = '当前修改尚未保存或同步';
    if (state === 'account-disabled') { $$('#password-form input, #password-form button').forEach((b) => { b.disabled = true; }); const badge=$('.settings-layout .pill'); if(badge){badge.textContent='账号已禁用';badge.className='pill red';} }
    if (state === 'version-changed') $$('[data-action^="resolve-"]').forEach((b) => { b.disabled = true; });
    if (['saving','save-error','readonly'].includes(state) && $('.save-state')) { $('.save-state').textContent = {saving:'正在保存…','save-error':'未保存 · 请重试',readonly:'只读'}[state]; $('.save-state').style.color = state === 'save-error' ? 'var(--red)' : 'var(--muted)'; }
    if (state === 'empty' || state === 'no-results') {
      const emptyPages = {
        projects: ['还没有项目空间', '创建你的第一个项目，开始记录今天的小计划。', '新建项目', 'new-project'],
        classification: ['还没有自定义目录', '先创建一个目录，未归类的任务仍保留在“未分类”中。', '新建目录', 'new-folder'],
        tags: ['还没有标签', '添加标签，把不同目录中相关的任务串起来。', '新建标签', 'new-tag'],
        trash: ['回收站是空的', '删除后的内容会在这里保留 30 天。', '返回任务', 'today.html'],
        history: ['还没有云端历史记录', '内容成功同步后，可以在这里查看每一次变化。', '查看同步状态', 'sync.html'],
        snapshots: ['还没有项目快照', '创建一个快照，为当前进度留一个恢复时间点。', '创建快照', 'create-snapshot'],
        completed: ['还没有已完成的任务', '完成一件小事后，回来看看自己的进度。', '打开收件箱', 'inbox.html'],
        today: ['今天的任务都安排好了', '暂时没有到期或过期任务，给今天留一点空间。', '新建今日任务', 'editor.html?new=1&from=today'],
        upcoming: ['近期没有到期任务', '为任务设置截止日期后，它会出现在这里。', '查看全部任务', 'all.html'],
      };
      const info = state === 'no-results' ? ['没有找到相关任务','换个关键词，或清除筛选再试试看。','清除筛选',`${config.page}.html`] : emptyPages[config.page] || ['这里还是一片空白','从一件小事开始，慢慢建立自己的节奏。','新建任务','editor.html?new=1'];
      const target = $('[data-list-content]') || $('.timeline') || $('#snapshot-list') || $('[data-trash-panel="todo"]') || $('#tag-groups') || $('.folder-row')?.parentElement || $('.project-content .three-col');
      const action = info[3].includes('.html') ? `<a class="btn tonal" href="${info[3]}">${info[2]}</a>` : `<button class="btn tonal" data-action="${info[3]}">${info[2]}</button>`;
      const content = `<div class="empty" style="grid-column:1/-1"><div class="empty-symbol">✓</div><h2>${info[0]}</h2><p>${info[1]}</p>${action}</div>`;
      if (target) target.innerHTML = content;
      if (config.page === 'trash') { $$('[data-trash-panel]').forEach((el) => { el.innerHTML = content; }); $$('[data-trash-tab] .subtle').forEach((el) => { el.textContent = '0'; }); $('[data-action="empty-trash"]').disabled = true; }
      if (config.page === 'history') $('[data-action="load-history"]').hidden = true;
      if ($('[data-search-empty]')) $('[data-search-empty]').hidden = true;
    }
    if (state === 'loading' && $('[data-list-content]')) $('[data-list-content]').innerHTML = `<div style="padding-top:30px" aria-label="正在加载任务">${[70,90,60,85,65,90,75,40].map((n) => `<div class="skeleton" style="width:${n}%;height:18px;margin:22px 0"></div>`).join('')}</div>`;
    if (state === 'restoring' || state === 'restored') startRestore(state === 'restored');
  }
  const initialState = config.states.includes(params.get('state')) ? params.get('state') : 'normal';
  $('#demo-state').value = initialState;
  $('#demo-state').addEventListener('change', (e) => { const url = new URL(location.href); if (e.target.value === 'normal') url.searchParams.delete('state'); else url.searchParams.set('state', e.target.value); location.href = url.href; });

  function confirmAction(title, message, label, callback, danger = false) { openDialog(title, `<p>${message}</p>`, { confirm: label, danger, onConfirm: callback }); }
  function command() {
    openDialog('搜索任务或命令', '<div class="field"><label for="command-search" class="muted">输入任务名称，或选择一个操作</label><input id="command-search" type="search" placeholder="搜索…" autocomplete="off"></div><div class="command-results" id="command-results"></div>', { noFooter: true });
    const entries = [['新建任务','editor.html?new=1'],['打开今日','today.html'],['打开设置','settings.html'],...config.tasks.map((t) => [t.title,`editor.html?task=${t.id}`])];
    function update() { const term = $('#command-search').value.trim().toLowerCase(); const matches = entries.filter(([title]) => title.toLowerCase().includes(term)); $('#command-results').innerHTML = matches.length ? matches.slice(0,8).map(([title,href]) => `<a href="${href}">${esc(title)}<span class="subtle">↵</span></a>`).join('') : '<p class="small muted">没有找到相关任务。</p>'; }
    $('#command-search').addEventListener('input', update);
    $('#command-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#command-results a')?.click(); } if (e.key === 'ArrowDown') { e.preventDefault(); $('#command-results a')?.focus(); } }); update();
  }
  let restoreTimer;
  function startRestore(completed = false) {
    if (!$('#restore-form')) return;
    $('#restore-form').hidden = true; $('#restore-progress').hidden = false;
    if (completed) {
      $('#restore-progress h2').textContent = '项目已恢复，准备重新接入';
      $('#restore-progress-label').textContent = '所有内容已恢复，其他设备将在联网后更新';
      $('#restore-progress-bar').style.width = '100%';
      $('#restore-progress-actions').innerHTML = '<div class="notice warning">此浏览器有 2 项旧的未同步修改。重新接入前请先保留副本。</div><button class="btn primary mt" data-action="reconnect">检查本机修改并重新接入</button>';
    }
  }
  $('#restore-form')?.addEventListener('submit', (e) => { e.preventDefault(); if (!$('#restore-reason').value.trim()) { toast('请填写恢复原因'); return; } confirmAction('确认恢复整个项目？','会先保留当前内容快照，再恢复选定版本。此操作将影响所有设备。','开始恢复',() => { startRestore(); restoreTimer = setTimeout(() => startRestore(true), 2500); }); });
  $('#restore-mode')?.addEventListener('change', (e) => { const sequence = e.target.value === 'sequence'; $('#sequence-target').hidden = !sequence; $('#snapshot-target').hidden = sequence; $('#restore-sequence').required = sequence; });
  if (params.get('mode') === 'sequence' && $('#restore-mode')) { $('#restore-mode').value = 'sequence'; $('#restore-mode').dispatchEvent(new Event('change')); }
  $('[data-history-filter]')?.addEventListener('change', (e) => $$('[data-history-kind]').forEach((r) => { r.hidden = e.target.value !== 'all' && r.dataset.historyKind !== e.target.value; }));
  if (params.get('task') && $('#history-scope')) {
    const task = config.tasks.find((t) => t.id === params.get('task')) || config.tasks.find((t) => t.id === 'design');
    $('#history-scope').textContent = `${task.title} · 对象历史`;
    $('[data-history-filter]').closest('label').hidden = true;
    $('.timeline').innerHTML = ['14:32','13:12','09:18'].map((time,i) => `<div class="timeline-row" data-history-kind="todo"><time>${time}</time><div class="timeline-dot">·</div><div><p>${esc(task.title)}</p><small>${i === 1 ? 'Android 手机' : '此浏览器'} · v${8-i}</small></div><button class="btn text" data-action="history-detail" data-kind="todo" data-version="${8-i}">查看版本</button></div>`).join('');
  }
  $('#conflict-kind')?.addEventListener('change', (e) => {
    const content = {
      todo: ['完善 TaskTips Web 设计稿','本机新增：分栏编辑模式','远端新增：移动端任务筛选'],
      classification: ['目录与标签','产品设计 / 交互探索；标签：工作、灵感','产品设计 / 网页方案；标签：工作、待整理'],
      index: ['排序与删除记录','顺序：设计稿 → 阅读 → 散步；保留未确认的删除记录','顺序：散步 → 设计稿 → 阅读；包含远端删除记录'],
      image: ['工作台草图.png','本机图片：宽屏双栏草图 · 1280 × 720','远端图片：单栏草图 · 960 × 720'],
      deleted: ['完善 TaskTips Web 设计稿','本机保留了新的内容修改，尚未上传','此版本为删除。采用远端将移除这条任务，本机修改保留为恢复副本。'],
    }[e.target.value];
    $('#conflict-title').textContent = content[0];
    $$('[data-conflict-side]').forEach((el,i) => { el.innerHTML = `<h2>${esc(content[0])}</h2><blockquote>${esc(content[i+1])}</blockquote><p class="muted">选择前请确认整个对象的变化。</p>`; });
  });

  document.addEventListener('click', (e) => {
    const themeButton = e.target.closest('[data-set-theme]');
    if (themeButton) { setTheme(themeButton.dataset.setTheme); return; }
    const modeButton = e.target.closest('[data-mode]');
    if (modeButton) { changeMode(modeButton.dataset.mode); return; }
    const pane = e.target.closest('[data-pane]');
    if (pane) { $('#split-editor').classList.toggle('show-preview', pane.dataset.pane === 'preview'); $$('[data-pane]').forEach((b) => b.setAttribute('aria-pressed', String(b === pane))); return; }
    const toggle = e.target.closest('.switch');
    if (toggle) { toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true')); toast('偏好已更新'); return; }
    const color = e.target.closest('[data-color]');
    if (color) { $$('[data-color]',dialog).forEach((b) => b.setAttribute('aria-pressed',String(b===color))); return; }
    const pref = e.target.closest('[data-editor-pref]');
    if (pref) { writePref('editor',pref.dataset.editorPref); $$('[data-editor-pref]').forEach((b) => b.setAttribute('aria-pressed',String(b===pref))); toast('默认编辑模式已更新'); return; }
    const tab = e.target.closest('[data-trash-tab]');
    if (tab) { $$('[data-trash-tab]').forEach((b) => b.setAttribute('aria-selected',String(b===tab))); $$('[data-trash-panel]').forEach((p) => { p.hidden=p.dataset.trashPanel!==tab.dataset.trashTab; }); return; }
    const format = e.target.closest('[data-format]');
    if (format && source && !source.readOnly) {
      const wrappers = {bold:['**','**'],italic:['*','*'],strike:['~~','~~'],heading:['## ',''],list:['- ',''],task:['- [ ] ',''],quote:['> ',''],code:['`','`']};
      const [before,after] = wrappers[format.dataset.format];
      if (!instant.hidden) { instant.focus(); if (['bold','italic','strike'].includes(format.dataset.format)) { document.execCommand({bold:'bold',italic:'italic',strike:'strikeThrough'}[format.dataset.format]); } else document.execCommand('insertText',false,before+'内容'+after); recordEdit([...instant.childNodes].map(serialize).join('')); }
      else { const start=source.selectionStart,end=source.selectionEnd; const selected=source.value.slice(start,end)||'内容'; source.setRangeText(before+selected+after,start,end,'select'); source.dispatchEvent(new Event('input')); source.focus(); }
      return;
    }
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (operations[action]) { createEntity(action); return; }
    if (action === 'close-dialog') { closeDialog(); return; }
    if (action === 'toggle-nav') { document.body.classList.toggle('nav-open'); return; }
    if (action === 'theme-toggle') { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
    if (action === 'password') { const field=$('input',target.parentElement); field.type=field.type==='password'?'text':'password'; return; }
    if (action === 'command') { command(); return; }
    if (action === 'new-task') { location.href='editor.html?new=1'; return; }
    if (action === 'filter') { openFilter(); return; }
    if (action === 'clear-filter') { filter={category:'',tag:'',priority:'',mode:'and',due:''}; $('[data-list-search]').value=''; applyFilters(); return; }
    if (action === 'sort') {
      openDialog('任务排序','<div class="field"><label for="sort-key">排序方式</label><select id="sort-key" name="sort"><option value="default">默认排序</option><option value="priority">优先级</option><option value="date">截止日期</option><option value="title">标题</option></select></div><div class="field"><label for="sort-order">顺序</label><select id="sort-order" name="order"><option value="asc">升序</option><option value="desc">降序</option></select></div>',{confirm:'应用排序',onConfirm:(data)=>{ const key=data.get('sort'),mul=data.get('order')==='desc'?-1:1; $$('.list-group').forEach((g)=>{ const rows=$$('.task-row',g); rows.forEach((r,i)=>{r.dataset.initialOrder ??= String(i);}); rows.sort((a,b)=>mul*(key==='priority'?Number(a.dataset.priority)-Number(b.dataset.priority):key==='date'?(a.dataset.date||'99').localeCompare(b.dataset.date||'99'):key==='title'?$('.task-title',a).textContent.localeCompare($('.task-title',b).textContent,'zh'):Number(a.dataset.initialOrder)-Number(b.dataset.initialOrder))); rows.forEach((r)=>g.append(r)); }); target.lastChild.textContent = key==='default'?'默认排序':{priority:'优先级',date:'截止日期',title:'标题'}[key]; }}); return;
    }
    if (action === 'focus') { document.body.classList.toggle('focus-mode'); return; }
    if (action === 'complete-current') { const done=target.getAttribute('aria-pressed')!=='true';target.setAttribute('aria-pressed',String(done));target.lastChild.textContent=done?'已完成 · 重新打开':'标记完成';target.classList.toggle('green',done);saveFeedback();toast(done?'又完成了一件小事。':'任务已重新打开');return; }
    if (action === 'undo') { undo(); return; }
    if (action === 'scroll-sync') { syncingScroll=!syncingScroll; target.textContent=`同步滚动 ${syncingScroll?'✓':'−'}`; target.setAttribute('aria-pressed',String(syncingScroll)); return; }
    if (action === 'object-history') { location.href='history.html?task=design'; return; }
    if (action === 'date' || action === 'priority' || action === 'category' || action === 'editor-tags') {
      const options={date:['截止日期','<input class="input" type="date" name="value" value="2026-09-18">'],priority:['优先级','<select class="input" name="value"><option>无优先级</option><option>低优先级</option><option>中优先级</option><option selected>高优先级</option></select>'],category:['所属目录','<select class="input" name="value"><option>未分类</option><option selected>产品设计</option><option>个人生活</option><option>阅读清单</option></select>'],'editor-tags':['任务标签','<input class="input" name="value" value="工作" placeholder="多个标签以逗号分隔">']}[action];
      openDialog(options[0],`<div class="field"><label>${options[0]}</label>${options[1]}</div>`,{confirm:'保存',onConfirm:(data)=>{target.lastChild.textContent=String(data.get('value')) || (action==='date'?'截止日期':'未设置');saveFeedback();}}); return;
    }
    if (action === 'editor-link') { openDialog('插入链接',inputField('链接文字','','text')+inputField('链接地址','https://','url','type="url"'),{confirm:'插入',onConfirm:(data)=>{recordEdit(markdown+`\n[${data.get('text')}](${data.get('url')})\n`);renderEditor();}}); return; }
    if (action === 'image') { openDialog('导入图片','<p>支持 PNG、JPEG、GIF、WebP、BMP，每张不超过 10 MiB。图片保存在本机并参与同步。</p><div class="field"><label for="image-file">选择图片</label><input id="image-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" required></div>',{confirm:'确认导入',onConfirm:()=>{const file=$('#image-file').files[0];if(file && file.size>10*1024*1024){toast('图片不能超过 10 MiB');return false;}toast('图片导入流程预览完成，设计稿不保存附件');}}); return; }
    if (action === 'task-menu' || action === 'editor-more') { const row=target.closest('.task-row'); openDialog('任务操作',`<div class="command-results"><a href="history.html?task=${row?.dataset.task||'design'}">查看历史记录 →</a></div><p style="margin-top:18px">移入回收站后，30 天内可以恢复。</p>`,{confirm:'移入回收站',danger:true,onConfirm:()=>{row?.remove();toast('已移入回收站（设计演示）');if(!row)location.href='trash.html';}});return; }
    if (action === 'folder-menu' || action === 'tag-menu' || action === 'group-menu' || action === 'project-menu') {
      const holder=target.closest('.folder-row,.tag-card,.project-card,section');
      const label=$('strong,h2,h3,.section-title > span',holder)?.textContent.trim() || '属性';
      if (action === 'project-menu') { openDialog('重命名项目',inputField('项目名称',label,'name','maxlength="128"'),{confirm:'保存',onConfirm:(data)=>{$('h2',holder).textContent=String(data.get('name'));toast('项目名称已更新');}});return; }
      if (action === 'group-menu' && label.startsWith('其他')) { toast('“其他”是默认分组，不能重命名或删除'); return; }
      const isGroup=action==='group-menu';
      openDialog(isGroup?'管理标签分组':'编辑'+(action==='folder-menu'?'目录':action==='tag-menu'?'标签':'项目'),inputField('名称',label)+(!isGroup?colorPicker():'<p>删除分组后，组内标签会移入“其他”。默认分组不能重命名或删除。</p>')+`<div class="flex"><button type="button" class="btn danger" data-action="delete-entity">${isGroup?'删除分组':'移入回收站'}</button>${action==='folder-menu'?'<button type="button" class="btn" data-action="move-folder">移动目录</button>':''}${action==='tag-menu'?'<button type="button" class="btn" data-action="move-tag">设置分组</button>':''}</div>`,{confirm:'保存更改',onConfirm:(data)=>{const node=$('strong,h2,h3,.section-title > span',holder);if(node)node.textContent=String(data.get('name'));toast('更改已保存（设计演示）');}});return;
    }
    if (action === 'move-folder' || action === 'move-tag') { openDialog(action==='move-folder'?'移动目录':'设置标签分组',`<p>${action==='move-folder'?'不能移动到自身或子目录下，目录总深度不得超过三级。':'标签将显示在所选分组中，任务上的标签关联保持不变。'}</p><div class="field"><label for="move-target">目标位置</label><select id="move-target" name="value">${(action==='move-folder'?['根目录','产品设计','个人生活']:['其他','属性']).map((s)=>`<option>${s}</option>`).join('')}</select></div>`,{confirm:'移动',onConfirm:()=>toast('位置已更新（设计演示）')});return; }
    if (action === 'delete-entity') { confirmAction('确认删除？','相关内容会进入回收站。删除标签分组时，只会将组内标签移到“其他”。','确认删除',()=>toast('已完成删除操作（设计演示）'),true);return; }
    if (action === 'restore-item' || action === 'purge-item') { const row=target.closest('tr');confirmAction(action==='restore-item'?'恢复这项内容？':'彻底删除这项内容？',action==='restore-item'?'恢复后会保留原有目录与标签关联。':'此操作无法撤销，其他设备也将在同步后移除它。',action==='restore-item'?'恢复':'彻底删除',()=>{row.remove();toast(action==='restore-item'?'已恢复到原位置':'已彻底删除（设计演示）');},action==='purge-item');return; }
    if (action === 'empty-trash') { confirmAction('清空回收站？','所有类型的回收站内容将被彻底删除，此操作无法撤销。','清空回收站',()=>{$$('[data-trash-item]').forEach((r)=>r.remove());toast('回收站已清空（设计演示）');},true);return; }
    if (action === 'finish-init') { $('#init-percent').textContent='100%';$('#init-progress').style.width='100%';target.disabled=true;target.textContent='工作区已就绪';setTimeout(()=>{location.href='today.html';},650);return; }
    if (action === 'sync-now') { syncStatus('syncing');target.textContent='同步中…';setTimeout(()=>{target.textContent='立即同步';syncStatus('normal');toast('同步流程演示完成');},1100);return; }
    if (action.startsWith('resolve-')) { confirmAction('确认要保留的版本',`将使用${action==='resolve-local'?'本机':'远端'}版本，另一份内容保留为恢复副本。`,'确认并继续',()=>{toast('冲突已处理（设计演示）');setTimeout(()=>{location.href='sync.html';},800);});return; }
    if (action === 'history-detail') { const kind=target.dataset.kind;const historyTitle=target.closest('.timeline-row')?.querySelector('p')?.textContent || '完善 TaskTips Web 设计稿';const historyTask=config.tasks.find((t)=>t.title===historyTitle);const historyMarkdown=historyTask && historyTask.id!=='design'?`# ${historyTask.title}\n\n${historyTask.description}\n\n- [ ] 记下一个具体的行动`:config.sampleMarkdown;const detail=kind==='todo'?renderMarkdown(historyMarkdown):kind==='deleted'?'<h3>此版本为删除</h3><p>该任务在此时间点被彻底删除。</p>':kind==='image'?'<h3>工作台草图.png</h3><div style="height:150px;display:grid;grid-template-columns:1fr 3fr;gap:12px;background:var(--surface);padding:18px;border-radius:8px"><div style="background:var(--brand-soft);border-radius:6px"></div><div style="background:var(--panel);border-radius:6px;padding:18px"><h3>今日</h3><hr><p>一个清晰的工作空间</p></div></div>':`<h3>${kind==='classification'?'目录与标签':'排序与删除记录'}</h3><pre>${esc(kind==='classification'?'产品设计\n  交互探索\n个人生活\n阅读清单':'收件箱顺序\n1. 完善设计稿\n2. 阅读计划\n3. 傍晚散步')}</pre>`;openDialog('历史版本 · 只读',`<p>今天 14:32 · ${kind==='deleted'?'删除记录':'历史内容'} · 不会修改当前版本</p><div class="prose">${detail}</div>`,{confirm:'关闭',cancel:'返回'});$$('input',dialog).forEach((i)=>{i.disabled=true;});return; }
    if (action === 'load-history') { target.textContent='已加载全部历史记录';target.disabled=true;return; }
    if (action === 'create-snapshot') { confirmAction('创建当前项目快照','为“我的任务”的当前云端内容保留一个恢复时间点。','创建快照',()=>{const el=document.createElement('div');el.className='setting-row';el.innerHTML='<span class="grow"><strong class="small">刚刚创建的快照</strong><p class="small muted">手动创建 · 我的任务</p></span><span class="pill green">可恢复</span><a href="restore.html" class="btn text">恢复到此快照</a>';$('#snapshot-list').append(el);toast('快照已创建（设计演示）');});return; }
    if (action === 'cancel-restore') { openDialog('请求取消恢复',inputField('取消原因','','reason','maxlength="512"'),{confirm:'确认取消',onConfirm:(data)=>{if(!String(data.get('reason')).trim()){toast('请填写取消原因');return false;}clearTimeout(restoreTimer);toast('已请求取消，正在确认任务状态…');target.disabled=true;target.textContent='取消请求已提交';setTimeout(()=>{$('#restore-progress h2').textContent='恢复已取消';$('#restore-progress-label').textContent='已确认取消，原有项目内容保持可用';$('#restore-progress-actions').innerHTML='<a class="btn mt" href="snapshots.html">返回快照</a>';},800);}});return; }
    if (action === 'reconnect') { openDialog('重新接入恢复后的项目','<p>已保留本机未同步修改的恢复副本。请选择接下来的处理方式。</p><div class="field"><label for="reconnect-choice">本机修改</label><select id="reconnect-choice"><option>采用恢复后的云端内容，保留本机副本</option><option>重新比较本机修改，逐项解决冲突</option></select></div>',{confirm:'继续',onConfirm:()=>{location.href=$('#reconnect-choice').selectedIndex?'conflicts.html':'onboarding.html';}});return; }
    if (action === 'rename-device') { const h=$('h3',target.closest('.device-row'));openDialog('重命名设备',inputField('设备名称',h.textContent.trim(),'name','maxlength="128"'),{confirm:'保存',onConfirm:(data)=>{h.textContent=String(data.get('name'));toast('设备名称已更新');}});return; }
    if (action === 'revoke-device') { const row=target.closest('.device-row');confirmAction('撤销此设备？',target.dataset.current==='true'?'这是当前浏览器。撤销后会退出登录，需重新认证才能继续同步。':'此设备将停止同步并需要重新登录。本地未同步内容不会被远程删除。','撤销设备',()=>{if(target.dataset.current==='true')location.href='login.html';else{row.remove();toast('设备已撤销（设计演示）');}},true);return; }
    if (action === 'logout') { openDialog('退出登录','<p>此浏览器还有 2 项未同步修改。退出前请选择处理方式；清理后不会影响已同步的云端内容。</p><div class="field"><label for="logout-choice">未同步内容</label><select id="logout-choice"><option>同步后退出</option><option>导出后退出</option><option>丢弃未同步修改并退出</option></select></div>',{confirm:'确认退出',danger:true,onConfirm:()=>{toast('退出流程演示完成');location.href='login.html';}});return; }
    if (action === 'persist') { target.textContent='已申请保留';toast('持久存储申请状态预览，不实际修改浏览器授权');return; }
    if (action === 'export-backup') { confirmAction('导出项目备份','备份包括 15 条任务、目录、标签和 3 张图片，不包含账号凭据与设备身份。','确认导出',()=>toast('导出流程预览完成，未生成真实 ZIP 文件'));return; }
    if (action === 'import-backup') { openDialog('恢复内容备份','<p>先验证内容，再预览将覆盖的范围。恢复前会保留当前本地内容副本。</p><div class="field"><label for="backup-file">选择 TaskTips ZIP 备份</label><input id="backup-file" type="file" accept=".zip" required></div>',{confirm:'预览恢复内容',onConfirm:()=>{closeDialog();setTimeout(()=>openDialog('确认覆盖本地内容','<p>备份示例：12 条任务、3 个目录、4 个标签和 2 张图片。当前内容将先保留为恢复副本。</p><div class="notice warning">恢复后按本机改动参与同步，不导入旧设备身份或凭据。</div>',{confirm:'恢复备份',onConfirm:()=>toast('备份恢复流程预览完成，未读取或写入真实项目数据')}),0);return false;}});return; }
    if (action === 'clear-storage') { confirmAction('清理此浏览器的项目副本？','未同步内容需要先导出或同步。清理不会删除云端内容，下次打开会重新下载。','确认清理',()=>{location.href='onboarding.html';},true);return; }
    if (action === 'export-markdown') { const blob=new Blob([markdown],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tasktips-design-demo.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return; }
  });

  document.addEventListener('change', (e) => {
    if (!e.target.matches('.task-row > .task-check')) return;
    const row=e.target.closest('.task-row');row.classList.toggle('done',e.target.checked);row.dataset.done=String(e.target.checked);
    if (['today','inbox','upcoming','completed'].includes(config.page)) row.hidden=true;
    toast(e.target.checked?'又完成了一件小事。':'任务已重新打开');
  });
  document.addEventListener('keydown',(e)=>{
    if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();command();}
    if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&instant){e.preventDefault();saveFeedback();toast('本地保存交互演示');}
    if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&instant&&!dialog.open){e.preventDefault();undo(e.shiftKey);}
    if (e.key==='Escape')document.body.classList.remove('nav-open');
  });
  $('[data-auth]')?.addEventListener('submit',(e)=>{
    e.preventDefault();const register=e.target.dataset.auth==='register';
    if(register && $('#password').value!==$('#confirm-password').value){$('#auth-error').hidden=false;$('#auth-error').textContent='两次输入的密码不一致。';return;}
    location.href=register?'onboarding.html':'projects.html';
  });
  $('#password-form')?.addEventListener('submit',(e)=>{e.preventDefault();if($('#new-password').value!==$('#repeat-password').value){$('#password-error').hidden=false;$('#password-error').textContent='两次输入的新密码不一致。';return;}confirmAction('更新密码','本机及其他设备都将需要重新登录。','确认更新',()=>{location.href='login.html';});});
  applyState(initialState);
})();
