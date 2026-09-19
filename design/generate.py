"""Rebuild the standalone HTML design boards: python3 design/generate.py.

Shared shell and demo fixtures only. This is not the production application.
"""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parent
ICONS = {
    'check': '<path d="m5 12 4 4L19 6"/>',
    'logo': '<path d="M5 5h14v14H5z"/><path d="m8 12 3 3 5-6"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    'inbox': '<path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',
    'list': '<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
    'circle-check': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    'folder': '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    'tag': '<path d="m3 3 8 .3L21 13l-8 8L3.3 11 3 3Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    'trash': '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    'sync': '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
    'settings': '<path d="m10 2-.6 3-2.3 1.3L4 5.3 2 8.7 4.3 11v2L2 15.3l2 3.4 3.1-1 2.3 1.3.6 3h4l.6-3 2.3-1.3 3.1 1 2-3.4-2.3-2.3v-2L22 8.7l-2-3.4-3.1 1L14.6 5 14 2h-4Z"/><circle cx="12" cy="12" r="3"/>',
    'search': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'chevron': '<path d="m9 5 7 7-7 7"/>',
    'down': '<path d="m6 9 6 6 6-6"/>',
    'more': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'arrow': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    'back': '<path d="M20 12H4m6-6-6 6 6 6"/>',
    'filter': '<path d="M4 5h16M7 12h10M10 19h4"/><circle cx="8" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>',
    'sort': '<path d="M8 4v16m-4-4 4 4 4-4M16 4h5m-5 6h4m-4 6h3"/>',
    'flag': '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'close': '<path d="m6 6 12 12M18 6 6 18"/>',
    'shield': '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    'cloud': '<path d="M6 19a5 5 0 1 1-.7-10 7 7 0 0 1 13.5-1A5.5 5.5 0 0 1 18 19H6Z"/>',
    'wifi-off': '<path d="m3 3 18 18M2 8a18 18 0 0 1 3-2m4-1a17 17 0 0 1 13 3M5 12a12 12 0 0 1 4-2m6 0a12 12 0 0 1 4 2M8 16a6 6 0 0 1 5-1m-1 5h.01"/>',
    'history': '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/>',
    'download': '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    'upload': '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    'focus': '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    'monitor': '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    'phone': '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-2 13h.01"/>',
    'lock': '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    'eye': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'user': '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    'box': '<path d="m12 2 10 5v10l-10 5-10-5V7l10-5Z"/><path d="m2 7 10 5 10-5M12 12v10M7 4.5l10 5"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    'warning': '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    'link': '<path d="m10 14 4-4m-5-2 3-3a5 5 0 0 1 7 7l-3 3m-1 1-3 3a5 5 0 0 1-7-7l3-3"/>',
    'edit': '<path d="m15 3 6 6-12 12H3v-6L15 3Zm-3 3 6 6"/>',
    'undo': '<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
}


def icon(name, cls=''):
    return f'<svg class="icon {cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS.get(name, ICONS["list"])}</svg>'


def btn(label, name='', href='', action='', cls='', extra=''):
    tag = 'a' if href else 'button'
    attrs = f' href="{href}"' if href else ' type="button"'
    if action:
        attrs += f' data-action="{action}"'
    return f'<{tag}{attrs} class="btn {cls}" {extra}>{icon(name) if name else ""}{label}</{tag}>'


def ib(name, label, action='', extra=''):
    return f'<button type="button" class="icon-btn" aria-label="{label}" title="{label}" data-action="{action}" {extra}>{icon(name)}</button>'


def logo():
    return f'<a class="logo" href="today.html"><span class="logo-mark">{icon("logo")}</span>TaskTips</a>'


def pill(label, color=''):
    return f'<span class="pill {color}">{label}</span>'


def notice(text, color='', name='info'):
    return f'<div class="notice {color}">{icon(name)}<div>{text}</div></div>'


TASKS = [
    ('review', '整理上周产品评审记录', '把讨论变成清晰的下一步', '产品设计', '工作', '09-16', 2, False),
    ('read', '读完《设计中的设计》第二章', '留一点时间给新的视角', '阅读清单', '阅读', '09-17', 1, False),
    ('design', '完善 TaskTips Web 设计稿', '让任务、记录与灵感，在网页中自然连接', '产品设计', '工作', '09-18', 3, False),
    ('walk', '傍晚散步 30 分钟', '放下屏幕，看看今天的天空', '个人生活', '生活', '09-18', 0, False),
    ('sync', '核对多端同步的交互细节', '离线状态、冲突处理与自动保存', '产品设计', '工作', '09-18', 2, False),
    ('weekend', '计划周末的短途旅行', '天气、路线和想去的小店', '个人生活', '生活', '09-18', 1, False),
    ('notes', '整理本周学习笔记', '把零散知识串成自己的理解', '阅读清单', '阅读', '09-19', 1, False),
    ('plant', '给阳台的植物浇水', '记得看看新叶子', '个人生活', '生活', '09-20', 0, False),
    ('demo', '准备产品演示', '从一条任务讲起', '产品设计', '工作', '09-21', 3, False),
    ('book', '列出十月阅读书单', '两本技术书，一本文学作品', '阅读清单', '阅读', '09-23', 0, False),
    ('ideas', '收集有意思的网页交互', '键盘、布局和细微的反馈', '产品设计', '灵感', '', 0, False),
    ('coffee', '试试街角新开的咖啡店', '周日下午的一个小计划', '未分类', '生活', '', 0, False),
    ('theme', '确定明暗主题的品牌色', '保持桌面、移动与网页端的视觉一致', '产品设计', '工作', '09-18', 2, True),
    ('backup', '导出一份任务备份', '给重要的记录留一个副本', '未分类', '生活', '09-17', 0, True),
    ('desk', '整理工作台', '清理桌面，也清理思绪', '个人生活', '生活', '09-17', 0, True),
]


def task_row(t, selected=False):
    tid, title, subtitle, folder, tag, date, priority, done = t
    due = '今天' if date == '09-18' else ('明天' if date == '09-19' else date.replace('-', '/'))
    overdue = bool(date and date < '09-18' and not done)
    color = {'工作': 'blue', '生活': 'green', '阅读': 'purple', '灵感': 'amber'}[tag]
    return f'''<div class="task-row {'done' if done else ''} {'selected' if selected else ''}" data-task="{tid}" data-category="{folder}" data-tag="{tag}" data-priority="{priority}" data-date="{date}" data-done="{str(done).lower()}">
      <input class="task-check" type="checkbox" aria-label="{'取消完成' if done else '完成'}：{title}" {'checked' if done else ''}>
      <a href="editor.html?task={tid}" class="task-main"><span class="task-title">{title}</span><span class="task-subtitle">{icon('folder')}{folder}{pill(tag, color)}</span></a>
      <span class="priority" title="{'高优先级' if priority == 3 else ''}">{icon('flag') if priority == 3 else ''}</span>
      <span class="task-date {'overdue' if overdue else ''}">{due if not done else '已完成'}</span>
      {ib('more', '任务操作', 'task-menu', 'class="task-menu"').replace('class="icon-btn"', 'class="icon-btn task-menu"').replace(' class="task-menu"','')}
    </div>'''


PAGES = {}


def page(name, title, subtitle, content, section='工作台', active='', standalone=False, editor=False, states=None):
    PAGES[name] = dict(title=title, subtitle=subtitle, content=content, section=section, active=active or name, standalone=standalone, editor=editor, states=states or ['normal'])


NAV = [('today','sun','今日','6'),('inbox','inbox','收件箱','12'),('upcoming','calendar','即将到期','4'),('all','list','全部任务','15'),('completed','circle-check','已完成','3')]


def navlink(name, ico, label, count='', active=''):
    return f'<a href="{name}.html" class="nav-link {"active" if active == name else ""}" {"aria-current=page" if active == name else ""}>{icon(ico)}<span>{label}</span><span class="nav-count">{count}</span></a>'


def sidebar(active):
    work = ''.join(navlink(*row, active=active) for row in NAV)
    return f'''<aside class="sidebar" aria-label="主导航">{logo()}
    <a href="projects.html" class="project-picker flex"><span class="project-symbol">{icon('box')}</span><span class="grow"><strong class="small">我的任务</strong><small>个人工作空间</small></span>{icon('down','small')}</a>
    <nav><div class="nav-group">{work}</div>
    <div class="nav-group"><div class="nav-label">目录 {ib('plus','新建目录','new-folder')}</div>
    <a class="nav-link" href="inbox.html?category=产品设计">{icon('folder')}产品设计<span class="nav-count">5</span></a>
    <a class="nav-link nav-child" href="inbox.html?category=产品设计">交互探索</a>
    <a class="nav-link" href="inbox.html?category=个人生活">{icon('folder')}个人生活<span class="nav-count">3</span></a>
    <a class="nav-link" href="inbox.html?category=阅读清单">{icon('folder')}阅读清单<span class="nav-count">3</span></a>
    {navlink('classification','more','管理目录与标签',active=active)}</div>
    <div class="nav-group"><div class="nav-label">标签</div>
    <a class="nav-link" href="inbox.html?tag=工作"><span class="dot blue"></span>工作</a>
    <a class="nav-link" href="inbox.html?tag=生活"><span class="dot green"></span>生活</a>
    <a class="nav-link" href="inbox.html?tag=灵感"><span class="dot amber"></span>灵感</a></div></nav>
    <div class="sidebar-footer">{navlink('trash','trash','回收站',active=active)}{navlink('sync','sync','同步与数据',active=active)}{navlink('settings','settings','设置',active=active)}
    <a href="sync.html" class="sidebar-sync"><span class="dot"></span>所有更改已同步</a>
    <div class="sidebar-profile flex"><span class="avatar">林</span><span class="grow"><strong>林间</strong><small>lin@example.com</small></span><a href="account.html" class="icon-btn" aria-label="账号设置">{icon('more')}</a></div></div></aside>'''


def heading(title, description='', action=''):
    return f'<div class="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>'


def wrapcontent(content, narrow=False):
    return f'<div class="main-scroll"><div class="content {"narrow" if narrow else ""}">{content}</div></div>'


def empty(symbol, title, text, action=''):
    return f'<div class="empty"><div class="empty-symbol">{icon(symbol)}</div><h2>{title}</h2><p>{text}</p>{action}</div>'


def switch(label, checked=True):
    return f'<button class="switch" type="button" role="switch" aria-label="{label}" aria-checked="{str(checked).lower()}"></button>'


def setting(label, description, control):
    return f'<div class="setting-row"><div class="grow"><h3>{label}</h3><p>{description}</p></div>{control}</div>'


def make_lists():
    for name, _, title, count in NAV:
        descriptions = {'today':'2026 年 9 月 18 日，星期五', 'inbox':'把待办放在这里，再一件件从容完成。', 'upcoming':'为接下来的日子，留一点准备的时间。', 'all':'任务、记录与灵感，都在这里。', 'completed':'每一件完成的小事，都值得被看见。'}
        eligible = [t for t in TASKS if name == 'all' or (name == 'completed' and t[7]) or (name == 'inbox' and not t[7]) or (name == 'today' and not t[7] and t[5] and t[5] <= '09-18') or (name == 'upcoming' and not t[7] and t[5] > '09-18')]
        if name == 'today':
            groups = [('已过期', [t for t in eligible if t[5] < '09-18'], 'red'), ('今天到期', [t for t in eligible if t[5] == '09-18'], '')]
        elif name == 'upcoming':
            groups = [('这个周末 · 9 月 19–20 日', eligible[:2], ''), ('下周 · 9 月 21–27 日', eligible[2:], '')]
        elif name == 'completed':
            groups = [('今天完成', eligible[:1], ''), ('昨天完成', eligible[1:], '')]
        else:
            groups = [('全部未完成任务' if name == 'inbox' else '全部任务', eligible, '')]
        lists = ''.join(f'<section class="list-group"><h2 class="list-group-title {color}">{label}<span class="count">{len(items)}</span></h2>{"".join(task_row(t) for t in items)}</section>' for label, items, color in groups)
        summary = f'''<div class="summary-strip"><div class="summary-item"><strong class="summary-value">{count}</strong>{'已完成' if name == 'completed' else '个任务'}</div><span class="summary-divider"></span><div class="summary-item"><strong class="summary-value">{'2' if name == 'today' else '3'}</strong>{'已过期' if name == 'today' else '个目录'}</div><span class="spacer"></span><span class="summary-note muted small">{'慢慢来，也是一种进步。' if name != 'completed' else '给自己一个小小的肯定。'}</span><div class="progress-ring">25%</div></div>'''
        toolbar = f'''<div class="toolbar"><label class="list-search">{icon('search')}<input type="search" placeholder="搜索当前列表…" aria-label="搜索任务" data-list-search></label><span class="spacer"></span>{btn('筛选','filter',action='filter')}{btn('默认排序','sort',action='sort')}<span class="pill" data-filter-count hidden></span></div>'''
        body = heading(title, descriptions[name], btn('新建任务','plus',href='editor.html?new=1'+('&from=today' if name=='today' else ''),cls='primary')) + summary + toolbar
        body += f'<div data-list-content>{lists}</div><div data-search-empty hidden>{empty("search","没有找到相关任务","试试更短的关键词，或清除当前筛选。",btn("清除筛选",action="clear-filter",cls="tonal"))}</div>'
        body += f'<button class="add-task" data-action="new-task">{icon("plus")}添加一个新任务</button><div class="bottom-hint">{icon("cloud","small")}已保存到本机，并与其他设备同步</div>'
        page(name,title,descriptions[name],wrapcontent(body),states=['normal','empty','no-results','offline','loading','error'])


SAMPLE_MD = '''# 完善 TaskTips Web 设计稿

让任务、记录与灵感，在网页中自然连接。

## 这次想做到的事

沿用桌面端熟悉的蓝色，把移动端的轻盈带到更宽的屏幕上。打开网页，就能继续手边的事情。

> 保持简单，把空间留给真正重要的内容。

## 设计检查清单

- [x] 确定页面结构与导航
- [x] 整理浅色与深色主题
- [ ] 完成即时与分栏编辑两种模式
- [ ] 检查小屏幕下的编辑体验
- [ ] 补齐离线、空态和错误状态

## 交互备注

编辑内容自动保存。切换编辑模式时，正文、选区和撤销记录都应该留下来。

1. 从今日列表打开任务
2. 随手记录，随时继续
3. 完成后勾选，不必手动保存

---

下一步：和桌面端、移动端一起，检查整个使用流程。
'''


def sample_prose():
    return '''<h1>完善 TaskTips Web 设计稿</h1><p class="muted">让任务、记录与灵感，在网页中自然连接。</p><h2>这次想做到的事</h2><p>沿用桌面端熟悉的蓝色，把移动端的轻盈带到更宽的屏幕上。打开网页，就能继续手边的事情。</p><blockquote>保持简单，把空间留给真正重要的内容。</blockquote><h2>设计检查清单</h2><ul class="check-list"><li><input type="checkbox" class="task-check" checked aria-label="确定页面结构与导航">确定页面结构与导航</li><li><input type="checkbox" class="task-check" checked aria-label="整理浅色与深色主题">整理浅色与深色主题</li><li><input type="checkbox" class="task-check" aria-label="完成即时与分栏编辑两种模式">完成即时与分栏编辑两种模式</li><li><input type="checkbox" class="task-check" aria-label="检查小屏幕下的编辑体验">检查小屏幕下的编辑体验</li><li><input type="checkbox" class="task-check" aria-label="补齐离线、空态和错误状态">补齐离线、空态和错误状态</li></ul><h2>交互备注</h2><p>编辑内容自动保存。切换编辑模式时，正文、选区和撤销记录都应该留下来。</p><ol><li>从今日列表打开任务</li><li>随手记录，随时继续</li><li>完成后勾选，不必手动保存</li></ol><hr><p class="muted">下一步：和桌面端、移动端一起，检查整个使用流程。</p>'''


def make_editors():
    for name, split in [('editor',False),('editor-split',True)]:
        tasks = ''.join(task_row(t, t[0]=='design') for t in TASKS if not t[7] and t[5] and t[5]<='09-18')
        body = f'''<div class="editor-layout"><aside class="editor-task-list" aria-label="任务列表"><div class="between"><h2>今日 <span class="muted small">6</span></h2>{ib('plus','新建任务','new-task')}</div><p class="muted small" style="margin:8px 0 18px">9 月 18 日，星期五</p>{tasks}</aside>
        <section class="editor-area" aria-label="任务编辑器"><div class="editor-toolbar"><div class="segmented" aria-label="编辑模式"><button data-mode="instant" aria-pressed="{str(not split).lower()}">即时</button><button data-mode="split" aria-pressed="{str(split).lower()}">分栏</button></div><span class="save-state" aria-live="polite">已保存到本机</span><span class="spacer"></span>{ib('undo','撤销','undo')}{ib('focus','专注编辑','focus')}{ib('history','查看任务历史','object-history')}{ib('more','任务更多操作','editor-more')}</div>
        <div class="editor-meta"><button class="meta-chip" data-action="complete-current" aria-pressed="false">{icon('circle-check')}标记完成</button><button class="meta-chip" data-action="date">{icon('calendar')}今天到期</button><button class="meta-chip red" data-action="priority">{icon('flag')}高优先级</button><button class="meta-chip" data-action="category">{icon('folder')}产品设计</button><button class="meta-chip blue" data-action="editor-tags">{icon('tag')}工作</button></div>
        <div class="format-toolbar" aria-label="格式工具栏"><button data-format="bold" title="粗体"><strong>B</strong></button><button data-format="italic" title="斜体"><em>I</em></button><button data-format="strike" title="删除线"><s>S</s></button><span class="separator"></span><button data-format="heading" title="标题">H₂</button><button data-format="list" title="列表">{icon('list')}</button><button data-format="task" title="任务清单">{icon('circle-check')}</button><button data-format="quote" title="引用">❞</button><button data-format="code" title="代码">&lt;/&gt;</button><span class="separator"></span><button data-action="editor-link" title="插入链接">{icon('link')}</button><button data-action="image" title="导入图片">{icon('image')}</button><span class="spacer"></span><button class="small muted" data-action="scroll-sync" aria-pressed="true" title="切换分栏同步滚动">同步滚动 ✓</button></div>
        <div class="editor-content prose" id="instant-editor" contenteditable="true" role="textbox" aria-label="即时编辑正文" aria-multiline="true" spellcheck="false" {'hidden' if split else ''}>{sample_prose()}</div>
        <div class="split-mobile-tabs" {'hidden' if not split else ''}><div class="segmented"><button data-pane="source" aria-pressed="true">编辑</button><button data-pane="preview" aria-pressed="false">预览</button></div></div>
        <div class="split-container" id="split-editor" {'hidden' if not split else ''}><div class="source-pane"><div class="pane-title">MARKDOWN <span>源码</span></div><textarea class="source-editor" id="source-editor" aria-label="Markdown 源码" spellcheck="false">{escape(SAMPLE_MD)}</textarea></div><div class="split-divider" role="separator" aria-label="调整源码与预览宽度" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabindex="0"></div><div class="preview-pane"><div class="pane-title">PREVIEW <span>实时预览 · 只读</span></div><div class="prose" id="markdown-preview">{sample_prose()}</div></div></div>
        <footer class="editor-footer"><span id="word-count">{len(SAMPLE_MD)} 字符</span><span>最后编辑于 14:32 · 已同步</span></footer></section></div>'''
        page(name,'分栏编辑' if split else '即时编辑','同一份内容，两种专注的方式',body,active='today',editor=True,states=['normal','offline','saving','save-error','readonly','conflict'])


def make_auth():
    for register in [False, True]:
        name = 'register' if register else 'login'
        fields = '''<div class="field"><label for="email">邮箱地址</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required></div>''' if not register else '''<div class="field"><label for="invitation">邀请凭据</label><input id="invitation" name="invitation" placeholder="粘贴管理员提供的邀请凭据" required><small>账号邮箱已与邀请绑定，无需重新填写。</small></div>'''
        fields += f'''<div class="field"><label for="password">{'设置密码' if register else '密码'}</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="{'new-password' if register else 'current-password'}" placeholder="{'至少 12 个字符' if register else '请输入你的密码'}" {'minlength="12"' if register else ''} required>{ib('eye','显示或隐藏密码','password')}</div></div>'''
        if register:
            fields += '<div class="field"><label for="confirm-password">确认密码</label><input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" placeholder="再输入一次密码" minlength="12" required></div>'
        form = f'''<form class="auth-form" data-auth="{name}"><div class="eyebrow">{'YOUR NEXT CHAPTER' if register else 'WELCOME BACK'}</div><h1>{'开启你的 TaskTips' if register else '欢迎回来'}</h1><p>{'接受邀请，给想法和待办一个自己的空间。' if register else '登录后，继续记录你的每一个小计划。'}</p>{fields}<p class="field-error" id="auth-error" role="alert" hidden></p><button class="btn primary large full" type="submit">{'接受邀请并开始' if register else '登录'}{icon('arrow')}</button><div class="auth-divider"></div><p class="small muted">{'已经有账号了？ <a href="login.html">返回登录</a>' if register else '第一次使用？ <a href="register.html">通过邀请注册</a>'}</p><div class="auth-info">{icon('shield')}<span>首次使用需联网。登录并下载项目后，即可离线记录。公共设备使用后，请退出并清理本地数据。</span></div></form>'''
        body = f'''<div class="auth-layout"><section class="auth-brand">{logo()}<div class="auth-story"><div class="eyebrow">A LITTLE SPACE FOR YOUR DAY</div><h1>把想法记下来，<br>把事情做好。</h1><p>从随手一记，到认真完成。<br>让桌面、手机和网页，接续你的每一天。</p><div class="mini-workspace"><div class="between"><strong class="small">{icon('sun')} 今日的小计划</strong><span class="pill blue">3 项</span></div>{''.join(task_row(t) for t in [TASKS[2], TASKS[3], TASKS[12]])}</div></div><div class="auth-foot"><span>{icon('lock','small')} 私人空间</span><span>{icon('cloud','small')} 多端同步</span><span>{icon('edit','small')} 离线记录</span></div></section><section class="auth-form-side">{form}</section></div>'''
        page(name,'邀请注册' if register else '登录','认证入口',body,section='开始使用',standalone=True,states=['normal','invalid-invitation' if register else 'auth-error','offline'])


def standalone_header():
    return f'<header class="standalone-header">{logo()}<a class="flex muted small" href="account.html"><span class="avatar">林</span>林间{icon("down","small")}</a></header>'


def make_projects():
    cards = ''
    for title, desc, count, date, current in [('我的任务','工作、生活与日常灵感','15','刚刚',True),('阅读与学习','把读过的书，变成自己的理解','8','昨天',False)]:
        cards += f'<article class="project-card"><div class="between"><span class="feature-icon">{icon("box")}</span>{ib("more","项目操作","project-menu")}</div><a href="onboarding.html" class="grow" style="display:block;color:inherit"><h2>{title}</h2><p>{desc}</p><div class="card-foot"><span>{count} 条任务 · 私人项目</span><span>{"上次使用" if current else date} {icon("arrow","small")}</span></div></a></article>'
    cards += f'<button class="project-card new" data-action="new-project"><span class="feature-icon">{icon("plus")}</span><h3>新建项目</h3><p>为不同的事情留出独立空间</p></button>'
    body = f'<div class="standalone">{standalone_header()}<div class="project-content">{heading("从一个空间开始","欢迎回来，林间。选择你今天想继续的项目。") }<div class="three-col">{cards}</div><div class="bottom-hint">{icon("lock","small")}每个项目都是你的私人空间，数据独立保存。</div></div></div>'
    page('projects','项目空间','选择、创建与重命名项目',body,section='开始使用',standalone=True,states=['normal','empty','offline'])
    steps=''.join(f'<div class="step-row {state}"><span class="step-number">{icon("check","small") if state=="complete" else str(i)}</span><div class="grow">{title}<div class="subtle small">{sub}</div></div>{pill(label,color)}</div>' for i,title,sub,state,label,color in [(1,'验证账号与设备','Web 浏览器已连接','complete','已完成','green'),(2,'下载任务和分类','15 条任务 · 3 个目录','complete','已完成','green'),(3,'准备离线图片','正在保存 2 / 3 张图片','current','进行中','blue'),(4,'建立离线工作区','完成后即可断网使用','','等待中','')])
    body = f'<div class="standalone">{standalone_header()}<section class="panel loading-card"><div class="feature-icon" style="background:var(--brand-soft);color:var(--brand);margin-bottom:22px">{icon("cloud")}</div><h1 style="font-size:24px">正在为你准备工作区</h1><p class="muted small" style="margin:10px 0 26px">首次使用需要下载“我的任务”。以后打开就能继续记录。</p><div class="between small" style="margin-bottom:9px"><span>项目初始化</span><span class="blue" id="init-percent">78%</span></div><div class="progress-track"><span id="init-progress" style="width:78%"></span></div><div class="mt">{steps}</div><div class="mt">{btn("完成下载并进入","arrow",action="finish-init",cls="primary full")}</div><p class="muted small" style="margin-top:16px">此过程中可以安全离开，下次回来会继续准备。</p></section></div>'
    page('onboarding','初始化工作区','首次下载、进度与失败重试',body,section='开始使用',standalone=True,states=['normal','error','offline'])


def classification_tabs(active):
    return f'<nav class="tabs" aria-label="分类类型"><a href="classification.html" class="{"active" if active=="folders" else ""}">目录</a><a href="tags.html" class="{"active" if active=="tags" else ""}">标签与分组</a></nav>'


def make_classification():
    rows=''
    for name,sub,n,indent,color in [('产品设计','用清晰的结构，收纳工作的每一步',5,'','blue'),('交互探索','产品设计 / 交互探索',2,'indent','blue'),('网页细节','产品设计 / 交互探索 / 网页细节',1,'indent-2','blue'),('个人生活','日常的小事，也是重要的事',3,'','green'),('阅读清单','让知识慢慢长成自己的样子',3,'','purple'),('未分类','还没有归入目录的任务',1,'','muted')]:
        rows += f'<div class="folder-row {indent}"><span class="folder-icon {color}">{icon("folder" if name!="未分类" else "inbox")}</span><div class="grow"><strong>{name}</strong><p>{sub}</p></div><span class="count-text muted small">{n} 项未完成</span><a href="inbox.html?category={name if name in ["个人生活","阅读清单","未分类"] else "产品设计"}" class="icon-btn" aria-label="查看{name}任务">{icon("chevron")}</a>{ib("more",f"管理{name}","folder-menu") if name!="未分类" else ""}</div>'
    body=heading('目录与标签','给每一件事，找到合适的位置。',btn('新建目录','plus',action='new-folder',cls='primary'))+classification_tabs('folders')
    body+=f'<div class="between section-title"><span>我的目录</span><span>最多支持三级目录</span></div><section class="panel">{rows}</section><div class="mt">{notice("删除目录时，其中的任务和子目录会一同进入回收站，30 天内可以恢复。")}</div>'
    page('classification','目录管理','三级目录、颜色和移动',wrapcontent(body),section='分类',states=['normal','empty','offline'])
    groups=''
    for group,tags in [('属性',[('工作','blue',5),('生活','green',4),('阅读','purple',3)]),('其他',[('灵感','amber',1),('稍后处理','',2)])]:
        cards=''.join(f'<article class="tag-card"><div class="between"><a href="inbox.html?tag={name}" class="flex {color}">{icon("tag")}<h3>{name}</h3></a>{ib("more",f"管理标签{name}","tag-menu")}</div><p>{count} 项未完成 · {group}</p></article>' for name,color,count in tags)
        groups+=f'<section style="margin-bottom:28px"><div class="section-title"><span>{group} <span class="subtle">{len(tags)}</span></span>{ib("more",f"管理{group}分组","group-menu")}</div><div class="tag-grid">{cards}</div></section>'
    body=heading('目录与标签','一个任务可以有多个标签，轻松串起相关的事。',btn('新建标签','plus',action='new-tag',cls='primary'))+classification_tabs('tags')+f'<div id="tag-groups">{groups}</div>'+btn('新建分组','plus',action='new-group',cls='text')
    page('tags','标签与分组','标签颜色、归组与名称管理',wrapcontent(body),section='分类',active='classification',states=['normal','empty','offline'])


def make_trash():
    body=heading('回收站','暂时放下的事，还可以找回来。',btn('清空回收站','trash',action='empty-trash',cls='danger'))
    body+=notice('内容将在删除 30 天后彻底清除。恢复时会保留原有目录和标签。','', 'history')
    body+='<div class="tabs mt" role="tablist" aria-label="回收站类型"><button role="tab" aria-selected="true" data-trash-tab="todo">任务 <span class="subtle">3</span></button><button role="tab" aria-selected="false" data-trash-tab="folder">目录 <span class="subtle">1</span></button><button role="tab" aria-selected="false" data-trash-tab="tag">标签 <span class="subtle">1</span></button></div>'
    for kind,items in [('todo',[('旧版交互方案','产品设计','9 月 16 日','28 天'),('收集旅行攻略','个人生活','9 月 12 日','24 天'),('季度阅读计划草稿','阅读清单','9 月 1 日','13 天')]),('folder',[('归档灵感','包含 2 条任务与 1 个子目录','9 月 15 日','27 天')]),('tag',[('待整理','保留关联的 2 条任务','9 月 13 日','25 天')])]:
        rows=''.join(f'<tr data-trash-item><td><div class="flex">{icon("list" if kind=="todo" else kind)}<div><strong style="font-weight:500">{name}</strong><p class="muted">{folder}</p></div></div></td><td class="muted">{date}</td><td>{pill(left,"amber" if left=="13 天" else "")}</td><td><div class="flex">{btn("恢复",action="restore-item",cls="text")}{ib("trash","彻底删除","purge-item")}</div></td></tr>' for name,folder,date,left in items)
        body+=f'<div class="panel table-wrap" data-trash-panel="{kind}" {"hidden" if kind!="todo" else ""}><table class="data-table"><thead><tr><th>内容</th><th>删除时间</th><th>剩余保留</th><th>操作</th></tr></thead><tbody>{rows}</tbody></table></div>'
    page('trash','回收站','恢复、永久删除与同批目录恢复',wrapcontent(body),section='数据',states=['normal','empty','offline','restore-conflict'])


def make_sync():
    head=heading('同步与数据','一处记录，在每个设备上继续。',btn('立即同步','sync',action='sync-now',cls='primary'))
    status=f'''<section class="panel"><div class="panel-body flex" style="padding:27px"><span class="feature-icon" style="background:var(--green-soft);color:var(--green)">{icon('circle-check')}</span><div class="grow"><h2 id="sync-status-title">所有更改已同步</h2><p class="muted small" style="margin-top:5px" id="sync-status-description">上次同步：今天 14:32 · 我的任务</p></div>{pill('已连接','green')}</div><div class="panel-foot between"><span class="muted small">自动同步 · 有更改时和回到页面时同步</span>{switch('自动同步')}</div></section>'''
    stats='<div class="three-col stats mt">'+''.join(f'<div class="stat-card"><span class="small muted">{label}</span><div class="value">{count}</div><p>{sub}</p></div>' for label,count,sub in [('待上传','0','本机内容已提交'),('待处理冲突','0','所有版本一致'),('连接的设备','3','账号下的设备')])+'</div>'
    links=''.join(f'<a href="{href}.html" class="setting-row" style="color:inherit"><span class="feature-icon">{icon(ico)}</span><div class="grow"><h3>{title}</h3><p>{desc}</p></div>{icon("chevron")}</a>' for href,ico,title,desc in [('history','history','历史记录','看看内容是怎样一步步变好的'),('snapshots','box','快照与恢复','保存一个时间点，必要时回到过去'),('devices','monitor','管理设备','查看、重命名或撤销登录设备')])
    log=''.join(f'<tr><td class="muted">{time}</td><td>{direction}</td><td>{count}</td><td>{pill("成功","green")}</td></tr>' for time,direction,count in [('14:32:08','上传','1 条任务'),('14:28:41','下载','2 条任务'),('13:46:12','上传','1 个分类对象')])
    body=head+status+stats+f'<div class="two-col mt"><div class="panel">{links}</div><section class="panel"><div class="panel-head between"><h2>本机同步记录</h2><span class="muted small">今天</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>方向</th><th>内容数量</th><th>结果</th></tr></thead><tbody>{log}</tbody></table></div><div class="panel-foot muted small">仅记录操作摘要，不包含任务正文。</div></section></div>'
    page('sync','同步与数据','同步概况、自动同步与日志',wrapcontent(body),section='数据',states=['normal','offline','syncing','partial','conflict','auth-error','maintenance'])
    local='''<h2>这次想做到的事</h2><p>保持轻盈、清晰和熟悉。</p><h3>设计检查清单</h3><ul><li>确定页面结构与导航</li><li>整理浅色与深色主题</li><li class="diff-add">补充左右分栏编辑模式</li></ul><p class="muted">下一步：检查小屏幕下的布局。</p>'''
    remote='''<h2>这次想做到的事</h2><p>保持轻盈、清晰和熟悉。</p><h3>设计检查清单</h3><ul><li>确定页面结构与导航</li><li>整理浅色与深色主题</li><li class="diff-change">先验证移动端的任务筛选</li></ul><p class="muted">下一步：与桌面端一起联调。</p>'''
    compare=''
    for side,title,desc,content,color in [('local','本机版本','此浏览器 · 今天 14:32',local,'blue'),('remote','远端版本','Windows 桌面 · 今天 14:30',remote,'purple')]:
        compare+=f'<section class="panel comparison-card"><div class="panel-head between"><div><h2>{title}</h2><p>{desc}</p></div>{pill("尚未同步" if side=="local" else "已在云端",color)}</div><div class="prose" data-conflict-side="{side}">{content}</div><div class="panel-foot">{btn("保留本机版本" if side=="local" else "采用远端版本",action="resolve-"+side,cls="tonal full")}</div></section>'
    body=heading('选择要保留的版本','两台设备修改了同一份内容，需要你来决定。',btn('返回同步','back',href='sync.html'))
    body+=notice('请选择一个完整版本。另一份内容会保留为恢复副本，不会直接丢弃。','warning','warning')
    body+='<div class="between mt wrap"><div><h2 id="conflict-title">完善 TaskTips Web 设计稿</h2><p class="small muted" style="margin-top:5px">冲突 1 / 1 · 正文存在不同修改</p></div><label class="small muted">对象类型 <select class="input" id="conflict-kind" style="width:135px;min-height:32px;padding:5px 9px"><option value="todo">任务正文</option><option value="classification">目录与标签</option><option value="index">排序与删除记录</option><option value="image">图片</option><option value="deleted">远端已删除</option></select></label></div>'
    body+=f'<div class="two-col mt">{compare}</div>'
    page('conflicts','处理同步冲突','双版本比较与恢复副本',wrapcontent(body),section='数据',active='sync',states=['normal','version-changed'])


def make_history():
    rows=''
    for time,kind,title,device,version in [('14:32','todo','完善 TaskTips Web 设计稿','此浏览器','v8'),('14:28','todo','核对多端同步的交互细节','Android 手机','v4'),('13:46','classification','更新了目录与标签','此浏览器','v6'),('11:12','image','添加了图片：工作台草图.png','Windows 桌面','v1'),('10:35','index','调整了收件箱任务顺序','Windows 桌面','v3'),('09:08','deleted','彻底删除：旧版说明','Android 手机','v5')]:
        ico={'todo':'edit','classification':'folder','image':'image','index':'sort','deleted':'trash'}[kind]
        rows+=f'<div class="timeline-row" data-history-kind="{kind}"><time>{time}</time><div class="timeline-dot">{icon(ico,"small")}</div><div><p>{title}</p><small>{device} · {version}</small></div>{btn("查看版本",action="history-detail",cls="text",extra=f"data-kind=\"{kind}\"")}</div>'
    body=heading('历史记录','每一次变化，都有迹可循。',btn('快照与恢复','box',href='snapshots.html'))
    body+='<div class="toolbar"><span class="small muted" id="history-scope">我的任务 · 项目历史</span><span class="spacer"></span><label class="small muted">类型 <select class="input" data-history-filter style="width:120px;min-height:32px;padding:5px 9px"><option value="all">全部类型</option><option value="todo">任务</option><option value="classification">目录与标签</option><option value="image">图片</option><option value="index">排序与删除</option></select></label></div>'
    body+=f'<div class="section-title mt">今天 · 2026 年 9 月 18 日</div><div class="timeline">{rows}</div><div class="mt">{btn("加载更早记录",action="load-history",cls="full text")}</div><div class="bottom-hint">{icon("info","small")}历史版本只读，项目恢复请前往“快照与恢复”。</div>'
    page('history','历史记录','项目与对象版本、按需查看正文',wrapcontent(body,narrow=True),section='数据',active='sync',states=['normal','empty','offline','error'])
    cards=''
    for date,time,why,count in [('今天','14:00','手动创建',15),('昨天','23:00','自动快照',14),('9 月 16 日','23:00','自动快照',12)]:
        cards+=f'<div class="setting-row"><span class="feature-icon">{icon("box")}</span><div class="grow"><h3>{date} {time} <span class="pill green">可恢复</span></h3><p>{why} · 我的任务 · {count} 条任务</p></div>{btn("恢复到此快照",href="restore.html",cls="text")}</div>'
    body=heading('快照与恢复','为重要的进度，留一个可以返回的时间点。',btn('创建快照','plus',action='create-snapshot',cls='primary'))
    body+=notice('恢复会影响项目内的全部内容，并同步到所有设备。恢复前会保留当前内容的快照。','warning','info')
    body+=f'<section class="panel mt" id="snapshot-list"><div class="panel-head between"><h2>项目快照</h2><span class="small muted">我的任务</span></div>{cards}</section><div class="between mt wrap"><span class="small muted">也可以使用历史记录中的变更序号恢复。</span>{btn("按变更序号恢复",href="restore.html?mode=sequence",cls="text")}</div><section class="panel mt"><div class="panel-head"><h2>最近一次恢复</h2></div><div class="setting-row"><span class="feature-icon green">{icon("circle-check")}</span><div class="grow"><h3>已恢复到 9 月 12 日的快照</h3><p>9 月 13 日 09:20 · 原因：找回误删的项目内容</p></div>{pill("已完成","green")}</div></section>'
    page('snapshots','快照与恢复','创建快照与整项目恢复入口',wrapcontent(body),section='数据',active='sync',states=['normal','empty','maintenance','error'])
    body=heading('恢复项目','确认时间点，找回那时的内容。',btn('返回快照','back',href='snapshots.html'))
    body+=notice('这是整个项目的恢复，其他设备将在下次同步时接收恢复结果。','warning','warning')
    body+=f'''<form id="restore-form" class="panel mt"><div class="panel-head"><h2>恢复目标</h2></div><div class="panel-body"><div class="two-col"><div class="field"><label for="restore-mode">恢复方式</label><select id="restore-mode"><option value="snapshot">按快照恢复</option><option value="sequence">按变更序号恢复</option></select></div><div class="field" id="snapshot-target"><label for="restore-target">选择快照</label><select id="restore-target"><option>今天 14:00 · 15 条任务</option><option>昨天 23:00 · 14 条任务</option></select></div><div class="field" id="sequence-target" hidden><label for="restore-sequence">目标变更序号</label><input id="restore-sequence" type="number" min="0" placeholder="例如：128"></div></div><div class="field"><label for="restore-reason">恢复原因 <span class="red">*</span></label><textarea id="restore-reason" rows="3" maxlength="512" required placeholder="例如：找回误删的目录和任务"></textarea><small>原因将记录到恢复历史中。</small></div><label class="flex small"><input type="checkbox" required>我了解此操作会影响项目内的所有设备</label></div><div class="panel-foot between"><span class="small muted">当前内容会先保存为快照</span><button type="submit" class="btn primary">确认恢复</button></div></form><div class="panel mt" id="restore-progress" hidden><div class="panel-head"><h2>正在恢复项目</h2><p>可以离开此页面，恢复会继续进行。</p></div><div class="panel-body"><div class="step-row complete"><span class="step-number">{icon('check','small')}</span><div class="grow">已保存恢复前快照</div></div><div class="step-row current"><span class="step-number">2</span><div class="grow" id="restore-progress-label">正在恢复任务与分类…</div></div><div class="progress-track"><span id="restore-progress-bar" style="width:45%"></span></div><div class="mt" id="restore-progress-actions">{btn('取消恢复',action='cancel-restore',cls='text')}</div></div></div>'''
    page('restore','恢复项目','恢复确认、原因、进度与重新接入',wrapcontent(body,narrow=True),section='数据',active='sync',states=['normal','restoring','restored','error'])


SETTINGS_NAV=[('settings','sun','外观与编辑'),('account','user','账号与安全'),('devices','monitor','登录设备'),('storage','box','存储与备份')]


def settings_layout(active,content):
    nav=''.join(f'<a href="{name}.html" class="{"active" if name==active else ""}">{icon(ico)}{label}</a>' for name,ico,label in SETTINGS_NAV)
    return wrapcontent(heading('设置','让 TaskTips 以你习惯的方式工作。')+f'<div class="settings-layout"><nav class="settings-nav" aria-label="设置分类">{nav}</nav><div class="stack">{content}</div></div>')


def make_settings():
    themes=''.join(f'<button class="theme-option" data-set-theme="{mode}" aria-pressed="{str(mode=="system").lower()}"><span class="theme-preview {mode}"><span></span><span></span></span>{label}</button>' for mode,label in [('light','浅色'),('dark','深色'),('system','跟随系统')])
    content=f'<section class="panel"><div class="panel-head"><h2>外观</h2><p>熟悉的蓝色，在白天和夜晚都恰到好处。</p></div><div class="panel-body"><div class="theme-options">{themes}</div></div></section>'
    controls=setting('默认编辑模式','下次打开任务时使用的模式','<div class="segmented"><button data-editor-pref="instant" aria-pressed="true">即时</button><button data-editor-pref="split" aria-pressed="false">分栏</button></div>')+setting('分栏同步滚动','编辑源码时，预览跟随当前段落',switch('分栏同步滚动'))+setting('编辑字号','只影响此浏览器的显示','<select class="input" aria-label="编辑字号"><option>14 px</option><option selected>16 px</option><option>18 px</option></select>')+setting('减少动画','降低界面过渡和动态效果',switch('减少动画',False))
    content+=f'<section class="panel"><div class="panel-head"><h2>编辑偏好</h2></div>{controls}</section><section class="panel"><div class="setting-row"><span class="logo-mark">{icon("logo")}</span><div class="grow"><h3>TaskTips Web</h3><p>为每一个小计划，留一点空间。</p></div><span class="pill">v0.1</span></div><div class="panel-foot small muted">外观与编辑偏好保存在当前浏览器，不会改变其他设备。</div></section>'
    page('settings','外观与编辑','主题、默认模式与本机偏好',settings_layout('settings',content),section='设置',active='settings')
    profile=f'<section class="panel"><div class="panel-head"><h2>我的账号</h2></div><div class="panel-body flex"><span class="avatar" style="width:50px;height:50px;font-size:20px">林</span><div><h2>林间</h2><p class="small muted">lin@example.com</p></div><span class="spacer"></span>{pill("账号正常","green")}</div>{setting("账号邮箱","此邮箱用于登录 TaskTips", "<span class=\"small muted\">lin@example.com</span>")}</section>'
    pw='''<form id="password-form" class="panel"><div class="panel-head"><h2>修改密码</h2><p>修改后，本机与其他设备都需要重新登录。</p></div><div class="panel-body"><div class="field"><label for="current-password">当前密码</label><input id="current-password" type="password" autocomplete="current-password" required></div><div class="two-col"><div class="field"><label for="new-password">新密码</label><input id="new-password" type="password" autocomplete="new-password" minlength="12" placeholder="至少 12 个字符" required></div><div class="field"><label for="repeat-password">确认新密码</label><input id="repeat-password" type="password" autocomplete="new-password" minlength="12" required></div></div><p class="field-error" id="password-error" hidden role="alert"></p></div><div class="panel-foot" style="text-align:right"><button type="submit" class="btn">更新密码</button></div></form>'''
    logout=f'<section class="panel">{setting("退出登录","清理此浏览器的账号内容，未同步修改会先提醒处理。",btn("退出登录",action="logout",cls="danger"))}</section>'
    page('account','账号与安全','修改密码与安全退出',settings_layout('account',profile+pw+logout),section='设置',active='settings',states=['normal','auth-error','account-disabled'])
    devices=''
    for name,ico,platform,time,current in [('Chrome · 此浏览器','monitor','Web · macOS','刚刚',True),('我的 Windows 电脑','monitor','桌面客户端 · Windows 11','今天 14:30',False),('Pixel 9','phone','Android 客户端','今天 14:28',False)]:
        devices+=f'<div class="device-row"><span class="device-icon">{icon(ico)}</span><div class="grow"><h3>{name} {pill("当前设备","blue") if current else ""}</h3><p>{platform} · 最近活动：{time}</p></div><div class="device-actions flex">{ib("edit","重命名设备","rename-device")}{btn("撤销",action="revoke-device",cls="text",extra=f"data-current=\"{str(current).lower()}\"")}</div></div>'
    content=notice('这里显示账号登录过的设备。“最近活动”不代表设备当前在线。')+f'<section class="panel"><div class="panel-head between"><h2>登录设备</h2><span class="muted small">3 台设备</span></div>{devices}</section><p class="muted small">撤销设备后，该设备将停止同步并需要重新登录。本地尚未同步的内容不会被远程删除。</p>'
    page('devices','登录设备','查看、重命名和撤销设备',settings_layout('devices',content),section='设置',active='settings',states=['normal','offline','error'])
    usage=f'<section class="panel"><div class="panel-head"><h2>浏览器存储</h2><p>在这个浏览器中，任务也有一份离线副本。</p></div><div class="panel-body"><div class="between"><span><strong style="font-size:27px;letter-spacing:-1px">24.8</strong> <span class="muted small">MB 已使用</span></span>{pill("离线内容已就绪","green")}</div><div class="progress-track mt"><span style="width:28%"></span></div><div class="flex wrap mt small muted"><span class="flex"><span class="dot blue"></span>任务 1.2 MB</span><span class="flex"><span class="dot purple"></span>图片 21.6 MB</span><span class="flex"><span class="dot"></span>恢复副本 2.0 MB</span></div></div>{setting("持久存储","减少浏览器自动清理的可能，不替代备份。",btn("申请保留",action="persist",cls="tonal"))}</section>'
    backup=f'<section class="panel"><div class="panel-head"><h2>内容备份</h2><p>为重要的记录，留一份自己的副本。</p></div>{setting("导出备份","下载任务、目录、标签和图片，不包含账号凭据。",btn("导出 ZIP","download",action="export-backup"))}{setting("恢复备份","选择兼容的 TaskTips ZIP，预览内容后再恢复。",btn("选择备份","upload",action="import-backup"))}</section>'
    clear=f'<section class="panel">{setting("清理本地副本","云端内容不受影响，下次打开需重新下载。",btn("清理",action="clear-storage",cls="danger"))}</section>'+notice('浏览器清理网站数据或隐私窗口关闭后，本地内容可能消失。未同步的修改请先同步或导出备份。','warning','info')
    page('storage','存储与备份','离线容量、内容导出与恢复',settings_layout('storage',usage+backup+clear),section='设置',active='settings',states=['normal','quota','corrupt','offline'])


def make_states():
    states=[('inbox','暂无待办，轻装出发','从一个小任务开始，把想法记下来。','新建任务','editor.html?new=1'),('search','没有找到相关任务','试试更短的关键词，或清除当前筛选。','返回收件箱','inbox.html'),('wifi-off','离线也能继续记录','修改已保存到本机，联网后会继续同步。','查看离线状态','today.html?state=offline'),('lock','请重新登录','你的内容仍保留在本机，登录后可以继续同步。','返回登录','login.html'),('warning','还没有保存成功','存储空间不足，请保留当前页面并导出正文。','查看编辑器','editor.html?state=save-error'),('sync','先选一个版本','其他设备也修改了这份内容，需要你来决定。','处理冲突','conflicts.html'),('box','项目正在维护','暂时无法同步，本机修改会继续保留。','查看同步状态','sync.html?state=maintenance'),('history','这份内容需要恢复','原始内容已保留，请从可靠的副本恢复。','检查存储','storage.html?state=corrupt')]
    cards=''.join(f'<section class="panel state-card">{empty(ico,title,desc,btn(action,href=href,cls="tonal"))}</section>' for ico,title,desc,action,href in states)
    skeleton='<section class="panel state-card"><div class="panel-body"><h2>正在准备任务列表</h2><p class="muted small" style="margin:9px 0 25px">保留页面结构，不闪成空白。</p>'+''.join(f'<div class="skeleton" style="width:{n}%"></div>' for n in [65,90,76,85,50])+f'{btn("查看加载状态",href="today.html?state=loading",cls="text")}</div></section>'
    page('states','状态与反馈','空态、加载、错误及恢复引导',wrapcontent(heading('每种状态，都有下一步','实现参考：不同状态使用独立文案和可执行的操作。')+f'<div class="three-col">{cards}{skeleton}</div>'),section='设计参考',states=['normal'])


def make_gallery():
    groups=[('01','开始使用',['login','register','projects','onboarding']),('02','任务工作台',['today','inbox','upcoming','all','completed']),('03','记录与整理',['editor','editor-split','classification','tags','trash']),('04','同步与数据',['sync','conflicts','history','snapshots','restore']),('05','设置与状态',['settings','account','devices','storage','states'])]
    sections=''
    for number,title,names in groups:
        cards=''
        for name in names:
            item=PAGES[name]
            variant='auth' if name in ['login','register'] else 'split' if name in ['editor','editor-split','conflicts'] else 'cards' if name in ['projects','snapshots','states'] else ''
            mini='<b></b><i></i><i></i><i></i>'
            if variant in ['split','cards']:
                mini=f'<div>{mini}</div><div>{mini}</div>'
            cards+=f'<a href="{name}.html" class="gallery-card"><div class="mini-page {variant}"><div class="mini-side"></div><div class="mini-main">{mini}</div></div><div class="gallery-card-info"><div class="between"><h3>{item["title"]}</h3>{icon("arrow","small")}</div><p>{item["subtitle"]}</p></div></a>'
        sections+=f'<section class="gallery-section"><div class="gallery-section-title"><h2><span class="subtle" style="font-size:11px;margin-right:11px">{number}</span>{title}</h2><span class="subtle small">{len(names)} 个页面</span></div><div class="gallery-grid">{cards}</div></section>'
    body=f'''<main class="gallery"><header class="between">{logo()}<a href="../docs/tasktips-web-design.md#html-designs" class="btn">{icon('link')}产品与前端设计</a></header><div class="gallery-header"><div class="eyebrow">TASKTIPS WEB · DESIGN REFERENCE 0.2</div><h1>熟悉的 TaskTips，<br>更开阔的记录空间。</h1><p>延续桌面端的清晰与移动端的轻盈，为网页重新安排每一处交互。<br>从登录到离线记录，从一条任务到所有小计划，都在这里。</p><div class="flex wrap mt">{btn('打开工作台','arrow',href='today.html',cls='primary large')}{btn('体验双模式编辑','edit',href='editor-split.html',cls='large')}<span class="pill">24 个页面 · 明暗主题 · 响应式布局</span></div></div>{sections}<section class="design-notes"><h2>给实现者的说明</h2><p>这是交互设计参考，使用固定示例数据，不连接服务端。页面底部可切换明暗主题及状态；表单、编辑模式、筛选、确认弹层等可交互。任务、备份和恢复操作仅演示界面反馈。</p><p>业务规则以产品与前端设计文档为准；静态状态按钮和本预览目录不进入产品。共享令牌位于 assets/design.css，页面与文档映射见 README.md。</p><div class="token-row"><span class="flex"><i class="theme-dot" style="background:#0078d4"></i>品牌蓝 #0078D4</span><span class="flex"><i class="theme-dot" style="background:#4a9eff"></i>深色强调 #4A9EFF</span><span class="flex"><i class="theme-dot" style="background:#f3f3f3"></i>浅灰底色 #F3F3F3</span></div></section></main>'''
    page('index','Web 设计稿总览','全部页面与交互索引',body,section='设计参考',standalone=True)


STATE_LABELS={'normal':'默认状态','empty':'空内容','no-results':'无搜索结果','offline':'离线','loading':'加载中','error':'请求失败','saving':'保存中','save-error':'保存失败','readonly':'其他标签页编辑中','conflict':'存在冲突','invalid-invitation':'邀请已失效','auth-error':'登录已失效','restore-conflict':'恢复同名冲突','syncing':'正在同步','partial':'部分失败','maintenance':'项目维护','version-changed':'版本再次变化','restoring':'恢复进行中','restored':'恢复已完成','account-disabled':'账号被禁用','quota':'空间不足','corrupt':'内容损坏'}


def review(name,p):
    options=''.join(f'<option value="{s}">{STATE_LABELS[s]}</option>' for s in p['states'])
    return f'''<footer class="review-bar" aria-label="设计稿预览工具"><a href="index.html">{icon('logo','small')} 设计目录</a><strong class="review-version">V0.2</strong><span class="review-label">{p['title']} · 仅交互演示</span><span class="spacer"></span><label class="flex" style="gap:5px">状态 <select id="demo-state" aria-label="预览页面状态">{options}</select></label><div class="review-theme" aria-label="预览主题"><button data-set-theme="light" aria-pressed="false">浅色</button><button data-set-theme="dark" aria-pressed="false">深色</button><button data-set-theme="system" aria-pressed="true">系统</button></div><a href="../docs/tasktips-web-design.md#ui-{name}">设计说明 ↗</a></footer>'''


def render(name,p):
    if p['standalone']:
        main=p['content']
    else:
        main=f'''<div class="nav-backdrop" data-action="toggle-nav"></div><div class="app-shell">{sidebar(p['active'])}<main class="app-main"><header class="topbar">{btn('', 'back', href='today.html', cls='icon-btn mobile-nav', extra='aria-label="返回任务列表"') if p['editor'] else ib('menu','展开导航','toggle-nav','class="mobile-nav"').replace('class="icon-btn"','class="icon-btn mobile-nav"').replace(' class="mobile-nav"','')}<div class="breadcrumb"><span>我的任务</span>{icon('chevron')}<span>{p['title']}</span></div><span class="spacer"></span><button class="search-trigger" data-action="command" aria-label="搜索任务或命令">{icon('search')}<span>搜索任务或命令</span><kbd>⌘ K</kbd></button>{btn('新建','plus',href='editor.html?new=1',cls='primary')}{ib('sun','切换明暗主题','theme-toggle')}</header><div id="state-banner" hidden></div>{p['content']}</main></div>'''
    config=json.dumps({'page':name,'title':p['title'],'states':p['states'],'sampleMarkdown':SAMPLE_MD,'tasks':[{'id':t[0],'title':t[1],'description':t[2]} for t in TASKS]},ensure_ascii=False).replace('</','<\\/')
    return f'''<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="design-document" content="../docs/tasktips-web-design.md#ui-{name}">
  <title>{p['title']} · TaskTips Web 设计稿</title>
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/design.css">
  <script>try{{let t=localStorage.getItem('tasktips-design-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;}}catch(e){{}}</script>
  <script>window.TASKTIPS_DESIGN={config};</script>
  <script src="assets/design.js" defer></script>
</head>
<body data-page="{name}" {'class="focus-mode"' if name=='editor-split' else ''}>
{main}
{review(name,p)}
<dialog id="app-dialog" aria-labelledby="dialog-title"><div class="dialog-header"><h2 id="dialog-title"></h2><button class="icon-btn" data-action="close-dialog" aria-label="关闭弹层">{icon('close')}</button></div><div id="dialog-content"></div></dialog>
<div class="toast" role="status" aria-live="polite" id="toast"></div>
<noscript><p style="position:fixed;top:0;left:0;right:0;background:var(--amber-soft);padding:10px;text-align:center;z-index:100">此页布局可直接浏览；启用 JavaScript 后可体验主题、弹层及编辑模式切换。</p></noscript>
</body>
</html>
'''


def main():
    make_lists()
    make_editors()
    make_auth()
    make_projects()
    make_classification()
    make_trash()
    make_sync()
    make_history()
    make_settings()
    make_states()
    make_gallery()
    for name,p in PAGES.items():
        (ROOT/f'{name}.html').write_text(render(name,p),encoding='utf-8')
    print(f'Generated {len(PAGES)} HTML files in {ROOT}')


if __name__ == '__main__':
    main()
