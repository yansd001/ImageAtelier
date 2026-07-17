import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings, Sparkles, Search, Heart, SlidersHorizontal, Copy, Trash2, X, ChevronLeft, ChevronRight, ChevronDown, Download, Image as ImageIcon, LoaderCircle, AlertCircle, Check, Upload, Paperclip, ArrowRight, RefreshCw } from 'lucide-react'
import type { GenerationParams, Provider, ReferenceImage, Settings as AppSettings, Task } from './types'
import { defaultParams, defaultSettings } from './types'
import { fetchAvailableModels, generateImages } from './lib/imageApi'
import { hydrateTasks, loadSettings, loadTasks, saveSettings, saveTasks } from './lib/storage'

const models = {
  openai: ['gpt-image-2'],
  gemini: ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`读取参考图失败：${file.name}`))
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [provider, setProvider] = useState<Provider>('openai')
  const [model, setModel] = useState(models.openai[0])
  const [availableModels, setAvailableModels] = useState<string[]>(models.openai)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const [params, setParams] = useState<GenerationParams>(defaultParams)
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ taskId: string; index: number } | null>(null)
  const [referenceLightboxIndex, setReferenceLightboxIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    hydrateTasks(loadTasks())
      .then((storedTasks) => { if (!cancelled) { setTasks(storedTasks); setTasksLoaded(true) } })
      .catch((error) => { console.error('加载本地图片失败:', error); if (!cancelled) setTasksLoaded(true) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { if (tasksLoaded) void saveTasks(tasks) }, [tasks, tasksLoaded])
  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filteredTasks = useMemo(() => tasks.filter((task) => (!favoritesOnly || task.favorite) && (!search.trim() || task.prompt.toLowerCase().includes(search.trim().toLowerCase()))), [tasks, favoritesOnly, search])
  const generating = tasks.filter((task) => task.status === 'running').length
  const hasApiKey = Boolean(settings[provider].apiKey.trim() || settings.global.apiKey.trim())

  useEffect(() => {
    let cancelled = false
    const fallback = models[provider]
    setAvailableModels(fallback)
    setModel(fallback[0])
    setModelsLoading(true)
    fetchAvailableModels(provider, settings)
      .then((next) => {
        if (cancelled || !next.length) return
        setAvailableModels(next)
        setModel((current) => next.includes(current) ? current : next[0])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
  }, [provider, settings])

  const changeProvider = (next: Provider) => {
    setProvider(next)
    setModel(models[next][0])
    setParams(next === 'openai' ? defaultParams : { ...defaultParams, aspectRatio: '16:9', imageSize: '1K' })
  }

  const updateParam = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => setParams((current) => ({ ...current, [key]: value }))

  async function submit() {
    if (!tasksLoaded) return
    if (!prompt.trim()) { setNotice({ type: 'error', text: '请先输入提示词' }); return }
    if (!hasApiKey) { setNotice({ type: 'error', text: 'API 密钥未配置，请先打开设置填写 API Key' }); return }
    const task: Task = { id: uid(), prompt: prompt.trim(), provider, model, params: { ...params }, referenceImages: [...referenceImages], images: [], status: 'running', createdAt: Date.now(), favorite: false }
    setTasks((current) => [task, ...current])
    setPrompt('')
    setReferenceImages([])
    try {
      const images = await generateImages(provider, settings, model, task.prompt, task.params, task.referenceImages ?? [])
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, images, status: 'done' } : item))
      setNotice({ type: 'success', text: '图片生成完成' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: 'error', error: message } : item))
    }
  }

  async function retryTask(task: Task) {
    if (generating > 0) return
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, images: [], status: 'running', error: undefined } : item))
    try {
      const images = await generateImages(task.provider, settings, task.model, task.prompt, task.params, task.referenceImages ?? [])
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, images, status: 'done', error: undefined } : item))
      setNotice({ type: 'success', text: '重试生成完成' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: 'error', error: message } : item))
    }
  }

  function toggleFavorite(id: string) { setTasks((current) => current.map((task) => task.id === id ? { ...task, favorite: !task.favorite } : task)) }
  function removeTask(id: string) { setTasks((current) => current.filter((task) => task.id !== id)); if (lightbox?.taskId === id) setLightbox(null) }
  function copyPrompt(value: string) { void navigator.clipboard?.writeText(value); setNotice({ type: 'success', text: '提示词已复制' }) }
  async function downloadTaskImages(task: Task) {
    for (let index = 0; index < task.images.length; index += 1) {
      await downloadImageDirect(task.images[index], `image-${task.id}-${index + 1}.png`, (text) => setNotice({ type: 'error', text }))
    }
  }

  async function addReferenceFileArray(files: File[]) {
    if (!files.length) return
    const remaining = Math.max(0, 8 - referenceImages.length)
    if (!remaining) { setNotice({ type: 'error', text: '最多上传 8 张参考图' }); return }
    try {
      const next = await Promise.all(files.slice(0, remaining).map(async (file) => ({ id: uid(), name: file.name || `pasted-image-${uid()}.png`, dataUrl: await readFileAsDataUrl(file) })))
      setReferenceImages((current) => [...current, ...next])
      if (files.length > remaining) setNotice({ type: 'error', text: '最多上传 8 张参考图，已忽略超出部分' })
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : '读取参考图失败' }) }
  }

  async function addReferenceFiles(files: FileList | null) {
    await addReferenceFileArray(files ? Array.from(files) : [])
    if (referenceInputRef.current) referenceInputRef.current.value = ''
  }

  async function handlePromptPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedImages = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (!pastedImages.length) return
    event.preventDefault()
    await addReferenceFileArray(pastedImages)
  }

  const lightboxTask = lightbox ? tasks.find((task) => task.id === lightbox.taskId) : undefined
  const lightboxImage = lightbox && lightboxTask ? lightboxTask.images[lightbox.index] : undefined

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><img src="/logo.png" alt="烟神殿" /></div><div><strong>烟神殿生图工具</strong><span>多模型生图画廊</span></div></div>
        <div className="topbar-actions"><div className="status-pill"><span className={generating ? 'status-dot busy' : hasApiKey ? 'status-dot' : 'status-dot missing'} />{generating ? `${generating} 个任务生成中` : hasApiKey ? '工作区已就绪' : 'API 密钥未配置'}</div><button className="icon-button" onClick={() => setSettingsOpen(true)} title="配置 API"><Settings size={18} /></button></div>
      </header>
      <section className="modelbar"><div className="modelbar-inner"><div className="modelbar-title"><span className="eyebrow">MODEL</span><strong>选择生图模型</strong></div><div className="modelbar-provider"><span className="compact-label">提供商</span><div className="segmented"><button className={provider === 'openai' ? 'active' : ''} onClick={() => changeProvider('openai')}>OpenAI</button><button className={provider === 'gemini' ? 'active' : ''} onClick={() => changeProvider('gemini')}>Gemini</button></div></div><label className="modelbar-model"><span className="compact-label">生图模型 {modelsLoading && <em>加载中</em>}</span><ModelComboBox value={model} onChange={setModel} options={availableModels} /></label></div></section>
      <div className={`workspace ${tasks.length > 0 ? 'has-tasks' : ''}`}>
        <main className="gallery-main">
          <div className="gallery-toolbar"><div><span className="eyebrow">YOUR CANVAS</span><h2>画廊 <span>{tasks.length}</span></h2></div><div className="toolbar-actions"><div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索提示词" /></div><button className={`filter-button ${favoritesOnly ? 'selected' : ''}`} onClick={() => setFavoritesOnly((value) => !value)}><Heart size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />收藏</button></div></div>
          {filteredTasks.length === 0 ? <EmptyState hasTasks={tasks.length > 0} /> : <div className="task-grid">{filteredTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={(index) => setLightbox({ taskId: task.id, index })} onFavorite={() => toggleFavorite(task.id)} onDelete={() => removeTask(task.id)} onCopy={() => copyPrompt(task.prompt)} onRetry={() => void retryTask(task)} onDownload={() => void downloadTaskImages(task)} />)}</div>}
        </main>
      </div>
      <section className="composer-panel bottom-composer">
        {referenceImages.length > 0 && <div className="reference-above-input"><div className="reference-strip">{referenceImages.map((image, index) => <div className="reference-thumb" key={image.id}><div className="reference-preview-button" role="button" tabIndex={0} onPointerUp={(event) => { event.stopPropagation(); setReferenceLightboxIndex(index) }} onClick={(event) => { event.stopPropagation(); setReferenceLightboxIndex(index) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setReferenceLightboxIndex(index) } }} title="查看参考图"><img src={image.dataUrl} alt={image.name} /></div><button type="button" className="reference-remove-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setReferenceImages((current) => current.filter((item) => item.id !== image.id)) }} title="移除参考图"><X size={12} /></button></div>)}</div></div>}
        <textarea className="bottom-prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={(event) => void handlePromptPaste(event)} placeholder="描述你想生成的图片，可直接粘贴图片作为参考图..." rows={2} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit() } }} />
        <div className="bottom-controls"><div className="bottom-parameter-area">{provider === 'openai' ? <OpenAIParams params={params} updateParam={updateParam} /> : <GeminiParams params={params} updateParam={updateParam} />}</div><div className="bottom-reference-area"><input ref={referenceInputRef} className="hidden-file-input" type="file" accept="image/*" multiple onChange={(event) => void addReferenceFiles(event.target.files)} /><button className="attachment-button" onClick={() => referenceInputRef.current?.click()} title="上传参考图"><Paperclip size={18} /></button></div><button className={`generate-icon-button ${prompt.trim() && hasApiKey && tasksLoaded ? 'ready' : ''}`} onClick={() => void submit()} disabled={generating > 0 || !tasksLoaded} title={!tasksLoaded ? '正在加载本地画廊' : !hasApiKey ? 'API 密钥未配置' : prompt.trim() ? '生成图片' : '请输入提示词'}><ArrowRight size={21} /></button></div>
      </section>
      {settingsOpen && <SettingsModal settings={settings} onSave={(next) => { setSettings(next); setSettingsOpen(false); setNotice({ type: 'success', text: '配置已保存' }) }} onClose={() => setSettingsOpen(false)} />}
      {lightbox && lightboxImage && lightboxTask && <Lightbox task={lightboxTask} index={lightbox.index} src={lightboxImage} onClose={() => setLightbox(null)} onChange={(index) => setLightbox({ taskId: lightboxTask.id, index })} onDownloadError={(text) => setNotice({ type: 'error', text })} />}
      {referenceLightboxIndex !== null && referenceImages[referenceLightboxIndex] && <ReferenceLightbox images={referenceImages} index={referenceLightboxIndex} onClose={() => setReferenceLightboxIndex(null)} onChange={setReferenceLightboxIndex} />}
      {notice && <div className={`toast ${notice.type}`}><span>{notice.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}</span>{notice.text}<button onClick={() => setNotice(null)}><X size={14} /></button></div>}
    </div>
  )
}

function OpenAIParams({ params, updateParam }: { params: GenerationParams; updateParam: <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => void }) {
  return <div className="params-grid"><Param label="尺寸"><ParamSelect value={params.size} onChange={(value) => updateParam('size', value)} options={['1024x1024', '1536x1024', '1024x1536', 'auto']} /></Param><Param label="质量"><ParamSelect value={params.quality} onChange={(value) => updateParam('quality', value as GenerationParams['quality'])} options={['auto', 'low', 'medium', 'high']} /></Param><Param label="背景"><ParamSelect value={params.background} onChange={(value) => updateParam('background', value as GenerationParams['background'])} options={['auto', 'transparent', 'opaque']} /></Param><Param label="输出格式"><ParamSelect value={params.outputFormat} onChange={(value) => updateParam('outputFormat', value as GenerationParams['outputFormat'])} options={['png', 'jpeg', 'webp']} /></Param><Param label="生成数量"><input className="input-control" type="number" min={1} max={4} value={params.count} onChange={(event) => updateParam('count', Math.min(4, Math.max(1, Number(event.target.value) || 1)))} /></Param></div>
}

function GeminiParams({ params, updateParam }: { params: GenerationParams; updateParam: <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => void }) {
  return <div className="params-grid"><Param label="画面比例"><ParamSelect value={params.aspectRatio} onChange={(value) => updateParam('aspectRatio', value)} options={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']} /></Param><Param label="图像分辨率"><ParamSelect value={params.imageSize} onChange={(value) => updateParam('imageSize', value as GenerationParams['imageSize'])} options={['1K', '2K', '4K']} /></Param><Param label="生成数量"><input className="input-control" type="number" min={1} max={4} value={params.count} onChange={(event) => updateParam('count', Math.min(4, Math.max(1, Number(event.target.value) || 1)))} /></Param></div>
}

function Param({ label, children }: { label: string; children: React.ReactNode }) { return <label className="param"><span>{label}</span>{children}</label> }

async function downloadImageDirect(src: string, filename: string, onError: (message: string) => void) {
  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`下载失败 (${response.status})`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    onError('图片下载失败，请检查图片地址或跨域配置')
  }
}

const parameterLabels: Record<string, string> = {
  auto: '自动',
  low: '低',
  medium: '中',
  high: '高',
  transparent: '透明',
  opaque: '不透明',
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WEBP',
}

function ParamSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const displayLabel = (option: string) => parameterLabels[option] ?? option
  return <div className="param-select" ref={ref}><button type="button" className="param-select-trigger" onClick={() => setOpen((current) => !current)}><span>{displayLabel(value)}</span><ChevronDown size={14} className={open ? 'rotate' : ''} /></button>{open && <div className="param-select-menu">{options.map((option) => <button type="button" key={option} className={option === value ? 'selected' : ''} onClick={() => { onChange(option); setOpen(false) }}>{displayLabel(option)}</button>)}</div>}</div>
}

function ModelComboBox({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setQuery(value), [value])
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const filtered = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="model-combobox" ref={ref}><div className="model-combobox-input-wrap"><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); onChange(event.target.value); setOpen(true) }} placeholder="输入或选择模型" /><button type="button" onClick={() => setOpen((current) => !current)} title="展开模型列表"><ChevronDown size={14} className={open ? 'rotate' : ''} /></button></div>{open && <div className="model-combobox-menu">{filtered.length ? filtered.map((option) => <button type="button" key={option} className={option === value ? 'selected' : ''} onClick={() => { onChange(option); setQuery(option); setOpen(false) }}>{option}</button>) : <div className="model-combobox-empty">无匹配模型，可直接使用当前输入</div>}</div>}</div>
}

function EmptyState({ hasTasks }: { hasTasks: boolean }) { return <div className="empty-state"><div className="empty-icon"><ImageIcon size={24} /></div><h3>{hasTasks ? '没有匹配的作品' : '开始你的第一次创作'}</h3><p>{hasTasks ? '试试更换搜索词或取消收藏筛选。' : '在左侧输入提示词，生成的图片会出现在这里。'}</p></div> }

function TaskCard({ task, onOpen, onFavorite, onDelete, onCopy, onRetry, onDownload }: { task: Task; onOpen: (index: number) => void; onFavorite: () => void; onDelete: () => void; onCopy: () => void; onRetry: () => void; onDownload: () => void }) {
  return <article className="task-card"><div className="image-grid">{task.status === 'running' ? <div className="task-loading"><LoaderCircle size={26} className="spin" /><span>生成中...</span></div> : task.status === 'error' ? <div className="task-error"><AlertCircle size={25} /><span>{task.error}</span><button className="retry-button" onClick={onRetry}><RefreshCw size={13} />重试</button></div> : task.images.map((image, index) => <button className="image-tile" key={`${task.id}-${index}`} onClick={() => onOpen(index)}><img src={image} alt={task.prompt} /></button>)}</div><div className="task-body"><div className="task-topline"><span className={`provider-tag ${task.provider}`}>{task.provider === 'openai' ? 'OpenAI' : 'Gemini'}</span><span className="task-model">{task.model}</span>{(task.referenceImages?.length ?? 0) > 0 && <span className="reference-count" title={`${task.referenceImages?.length} 张参考图`}><Paperclip size={11} />{task.referenceImages?.length}</span>}<span className="task-time">{new Date(task.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><p className="task-prompt">{task.prompt}</p><div className="task-actions"><button onClick={onFavorite} title="收藏" className={task.favorite ? 'is-favorite' : ''}><Heart size={15} fill={task.favorite ? 'currentColor' : 'none'} /></button><button onClick={onCopy} title="复制提示词"><Copy size={15} /></button>{task.status === 'done' && task.images.length > 0 && <button onClick={onDownload} title={task.images.length > 1 ? '下载全部图片' : '下载图片'}><Download size={15} /></button>}<button onClick={onDelete} title="删除"><Trash2 size={15} /></button></div></div></article>
}

function SettingsModal({ settings, onSave, onClose }: { settings: AppSettings; onSave: (settings: AppSettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="settings-modal"><div className="modal-header"><div><span className="eyebrow">SETTINGS</span><h2>API 配置</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><p className="modal-subtitle">Base URL 只需要填写域名，例如 https://code.yansd666.com。提供商配置留空时自动使用全局配置。</p><div className="settings-provider"><div className="provider-title"><span className="provider-dot global" />全局配置</div><label>Base URL<input className="input-control" value={draft.global.baseUrl} onChange={(event) => setDraft({ ...draft, global: { ...draft.global, baseUrl: event.target.value } })} placeholder="https://code.yansd666.com" /></label><label>API Key<input className="input-control" type="password" value={draft.global.apiKey} onChange={(event) => setDraft({ ...draft, global: { ...draft.global, apiKey: event.target.value } })} placeholder="所有提供商共用的 Key" /></label></div><div className="settings-provider"><div className="provider-title"><span className="provider-dot openai" />OpenAI <small>可选覆盖</small></div><label>Base URL<input className="input-control" value={draft.openai.baseUrl} onChange={(event) => setDraft({ ...draft, openai: { ...draft.openai, baseUrl: event.target.value } })} placeholder="留空则使用全局域名" /></label><label>API Key<input className="input-control" type="password" value={draft.openai.apiKey} onChange={(event) => setDraft({ ...draft, openai: { ...draft.openai, apiKey: event.target.value } })} placeholder="留空则使用全局 Key" /></label></div><div className="settings-provider"><div className="provider-title"><span className="provider-dot gemini" />Gemini <small>可选覆盖</small></div><label>Base URL<input className="input-control" value={draft.gemini.baseUrl} onChange={(event) => setDraft({ ...draft, gemini: { ...draft.gemini, baseUrl: event.target.value } })} placeholder="留空则使用全局域名" /></label><label>API Key<input className="input-control" type="password" value={draft.gemini.apiKey} onChange={(event) => setDraft({ ...draft, gemini: { ...draft.gemini, apiKey: event.target.value } })} placeholder="留空则使用全局 Key" /></label></div><div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => onSave(draft)}>保存配置</button></div></section></div>
}

function Lightbox({ task, src, index, onClose, onChange, onDownloadError }: { task: Task; src: string; index: number; onClose: () => void; onChange: (index: number) => void; onDownloadError: (message: string) => void }) {
  const hasNav = task.images.length > 1
  return <div className="lightbox" onClick={onClose}><button type="button" className="lightbox-close" onClick={onClose}><X size={20} /></button>{hasNav && <button type="button" className="lightbox-nav left" onClick={(event) => { event.stopPropagation(); onChange((index - 1 + task.images.length) % task.images.length) }}><ChevronLeft size={24} /></button>}<img src={src} alt={task.prompt} onClick={(event) => event.stopPropagation()} />{hasNav && <button type="button" className="lightbox-nav right" onClick={(event) => { event.stopPropagation(); onChange((index + 1) % task.images.length) }}><ChevronRight size={24} /></button>}<div className="lightbox-caption"><span>{index + 1} / {task.images.length}</span><button type="button" className="lightbox-download" onClick={(event) => { event.stopPropagation(); void downloadImageDirect(src, `image-${task.id}-${index + 1}.png`, onDownloadError) }}><Download size={15} />下载</button></div></div>
}

function ReferenceLightbox({ images, index, onClose, onChange }: { images: ReferenceImage[]; index: number; onClose: () => void; onChange: (index: number) => void }) {
  const hasNav = images.length > 1
  return createPortal(<div className="lightbox reference-lightbox-layer" onClick={onClose}><button type="button" className="lightbox-close" onClick={onClose}><X size={20} /></button>{hasNav && <button type="button" className="lightbox-nav left" onClick={(event) => { event.stopPropagation(); onChange((index - 1 + images.length) % images.length) }}><ChevronLeft size={24} /></button>}<img src={images[index].dataUrl} alt={images[index].name} onClick={(event) => event.stopPropagation()} />{hasNav && <button type="button" className="lightbox-nav right" onClick={(event) => { event.stopPropagation(); onChange((index + 1) % images.length) }}><ChevronRight size={24} /></button>}<div className="lightbox-caption"><span>{index + 1} / {images.length}</span><span>{images[index].name}</span></div></div>, document.body)
}
