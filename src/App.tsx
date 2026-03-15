import { ChangeEvent, FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useLocale } from './hooks/useLocale';
import type { Locale } from './i18n/types';

type ApiCompatibility = 'auto' | 'chat-completions' | 'openai-images';

type ModelOption = {
 id: string;
 label: string;
 description: string;
};

type ApiSettings = {
 apiUrl: string;
 apiKey: string;
 compatibility: ApiCompatibility;
};

type GenerationJob = {
 id: string;
 model: string;
 prompt: string;
 aspectRatio: string;
 createdAt: string;
 images: string[];
 providerMessage?: string;
 mode?: string;
 endpoint?: string;
 referenceName?: string;
 favorite?: boolean;
};

type ApiResponse = {
 images?: string[];
 error?: string;
 providerMessage?: string;
 mode?: string;
 endpoint?: string;
};

type TranslationParams = Record<string, string | number>;

type TranslateFn = (key: string, fallback?: string) => string;

const SETTINGS_STORAGE_KEY = 'grok-draw-settings';
const MODELS: ModelOption[] = [
 {
 id: 'Grok-Imagine-1.0',
 label: 'Grok-Imagine-1.0',
 description: '标准绘图模式，适合多数高质量生成场景。',
 },
 {
 id: 'Grok-Imagine-1.0-Edit',
 label: 'Grok-Imagine-1.0-Edit',
 description: '参考图编辑模式，上传原图后可进行重绘或局部改造。',
 },
 {
 id: 'Grok-Imagine-1.0-Fast',
 label: 'Grok-Imagine-1.0-Fast',
 description: '快速出图模式，适合高频迭代与灵感草图。',
 },
];
const MODEL_KEY_MAP: Record<string, string> = {
 'Grok-Imagine-1.0': 'grokImagine',
 'Grok-Imagine-1.0-Edit': 'grokImagineEdit',
 'Grok-Imagine-1.0-Fast': 'grokImagineFast',
};
const ASPECT_RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16', '21:9'];
const RESULT_COUNTS = [1,2,3,4];
const DEFAULT_SETTINGS: ApiSettings = {
 apiUrl: 'https://mpp.pp.ua/v1/chat/completions',
 apiKey: '',
 compatibility: 'auto',
};

function formatTemplate(value: string, params?: TranslationParams) {
 if (!params) {
 return value;
 }

 return Object.entries(params).reduce((acc, [key, replacement]) => {
 return acc.split(`{${key}}`).join(String(replacement));
 }, value);
}

function tr(t: TranslateFn, key: string, fallback?: string, params?: TranslationParams) {
 return formatTemplate(t(key, fallback), params);
}

function readArray(t: TranslateFn, key: string) {
 try {
 return JSON.parse(t(key, '[]')) as string[];
 } catch {
 return [] as string[];
 }
}

export default function App() {
 const { locale, setLocale, t } = useLocale();
 const [model, setModel] = useState(MODELS[0].id);
 const [prompt, setPrompt] = useState(
 tr(t, 'sample.prompt', '一隻戴著透明太空頭盔的布偶貓，站在霓虹城市屋頂，電影感燈光，超高細節'),
 );
 const [aspectRatio, setAspectRatio] = useState('1:1');
 const [count, setCount] = useState(1);
 const [referenceImage, setReferenceImage] = useState<string | null>(null);
 const [referenceName, setReferenceName] = useState('');
 const [jobs, setJobs] = useState<GenerationJob[]>([]);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [selectedImage, setSelectedImage] = useState<{ url: string; prompt: string } | null>(null);
 const [settings] = useState<ApiSettings>(() => readStorage<ApiSettings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));

 const currentModel = useMemo(() => MODELS.find((item) => item.id === model) ?? MODELS[0], [model]);
 const modelKey = MODEL_KEY_MAP[model] || 'grokImagine';
 const currentModelDescription = t(`models.${modelKey}.description`, currentModel.description);
 const languageOptions: { value: Locale; label: string }[] = [
 { value: 'zh-TW', label: t('language.zhTW', '繁體中文') },
 { value: 'en-US', label: t('language.enUS', 'English') },
 ];
 const promptPresets = useMemo(() => readArray(t, 'preset.items'), [t, locale]);
 const tipsItems = useMemo(() => readArray(t, 'tips.items'), [t, locale]);
 const isEditMode = model.toLowerCase().includes('edit');
 const favoriteCount = jobs.filter((job: GenerationJob) => job.favorite).length;

 useEffect(() => {
 writeStorage(SETTINGS_STORAGE_KEY, settings);
 }, [settings]);

 useEffect(() => {
 if (!selectedImage) {
 return undefined;
 }

 const handleKeydown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') {
 setSelectedImage(null);
 }
 };

 window.addEventListener('keydown', handleKeydown);
 return () => window.removeEventListener('keydown', handleKeydown);
 }, [selectedImage]);

 const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];

 if (!file) {
 return;
 }

 setReferenceName(file.name);
 setError('');
 setNotice('');
 const dataUrl = await readFileAsDataUrl(file);
 setReferenceImage(dataUrl);
 };

 const handleApplyPromptPreset = (preset: string) => {
 const joiner = locale === 'en-US' ? ', ' : '，';
 setPrompt((current: string) => (current ? `${current}${joiner}${preset}` : preset));
 };

 const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
 event.preventDefault();

 if (!prompt.trim()) {
 setError(t('error.promptRequired', '請輸入提示詞。'));
 return;
 }

 if (isEditMode && !referenceImage) {
 setError(t('error.imageRequired', '編輯模式需要先上傳參考圖。'));
 return;
 }

 setError('');
 setNotice('');
 setIsSubmitting(true);

 try {
 const response = await fetch('/api/grok', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model,
 prompt,
 aspectRatio,
 count,
 imageDataUrl: referenceImage,
 apiUrl: settings.apiUrl.trim(),
 apiKey: settings.apiKey.trim(),
 compatibility: settings.compatibility,
 }),
 });

 const result = (await response.json()) as ApiResponse;

 if (!response.ok || !result.images?.length) {
 throw new Error(result.error || t('error.generateFailed', '生成失敗，請稍後重試。'));
 }

 const newJob: GenerationJob = {
 id: crypto.randomUUID(),
 model,
 prompt,
 aspectRatio,
 createdAt: new Date().toLocaleString(locale === 'en-US' ? 'en-US' : 'zh-TW'),
 images: result.images,
 providerMessage: result.providerMessage,
 mode: result.mode,
 endpoint: result.endpoint,
 referenceName: referenceName || undefined,
 favorite: false,
 };

 setJobs((current: GenerationJob[]) => [newJob, ...current]);
 setNotice(tr(t, 'notice.success', '已完成 {count} 張圖片生成。', { count: result.images.length }));
 } catch (submitError) {
 setError(submitError instanceof Error ? submitError.message : t('error.requestFailed', '請求失敗，請稍後重試。'));
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleReuseJob = (job: GenerationJob) => {
 setModel(job.model);
 setPrompt(job.prompt);
 setAspectRatio(job.aspectRatio);
 setNotice(t('notice.reuse', '已將該任務參數填回創作面板。'));
 setError('');
 };

 const handleCopyPrompt = async (jobPrompt: string) => {
 try {
 await navigator.clipboard.writeText(jobPrompt);
 setNotice(t('notice.copy', '提示詞已複製。'));
 setError('');
 } catch {
 setError(t('error.copyFailed', '複製失敗，請檢查瀏覽器剪貼簿權限。'));
 }
 };

 const toggleFavorite = (jobId: string) => {
 setJobs((current: GenerationJob[]) =>
 current.map((job: GenerationJob) => (job.id === jobId ? { ...job, favorite: !job.favorite } : job)),
 );
 };

 const clearJobs = () => {
 setJobs([]);
 setNotice(t('notice.clear', '已清空目前結果記錄。'));
 setError('');
 };

 return (
 <div className="app-shell">
 <div className="background-orb orb-1" />
 <div className="background-orb orb-2" />
 <main className="page">
 <section className="hero">
 <div>
 <span className="badge">{t('badge.cloudflare', 'Cloudflare Ready')}</span>
 <h1>{t('app.title', 'Grok Draw Studio')}</h1>
 <p className="hero-copy">
 {t(
 'app.subtitle',
 '面向 Grok-Imagine 與 OpenAI兼容圖片介面的繪圖工作台，支援文生圖、參考圖編輯、結果放大預覽與任務復用。',
 )}
 </p>
 </div>
 <div className="hero-stats">
 <article>
 <strong>{MODELS.length}</strong>
 <span>{t('hero.models', '內建模型')}</span>
 </article>
 <article>
 <strong>{jobs.length}</strong>
 <span>{t('hero.jobs', '目前任務記錄')}</span>
 </article>
 <article>
 <strong>{favoriteCount}</strong>
 <span>{t('hero.favorites', '收藏作品')}</span>
 </article>
 </div>
 </section>

 <section className="workspace-grid">
 <form className="panel form-panel" onSubmit={handleSubmit}>
 <div className="panel-header">
 <div>
 <h2>{t('panel.create', '創作面板')}</h2>
 <p>{currentModelDescription}</p>
 </div>
 <span className="mode-pill">
 {isEditMode ? t('panel.modeEdit', '參考圖編輯') : t('panel.modeText', '文本生成')}
 </span>
 </div>

 <LanguageSwitcher label={t('language.label', '介面語言')} locale={locale} options={languageOptions} onChange={setLocale} />

 <label className="field">
 <span>{t('field.model', '模型')}</span>
 <select value={model} onChange={(event: ChangeEvent<HTMLSelectElement>) => setModel(event.target.value)}>
 {MODELS.map((item) => (
 <option key={item.id} value={item.id}>
 {item.label}
 </option>
 ))}
 </select>
 </label>

 <label className="field">
 <span>{t('field.prompt', '提示詞')}</span>
 <textarea
 rows={6}
 value={prompt}
 onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
 placeholder={t('field.promptPlaceholder', '描述你想生成或編輯的畫面內容、風格、鏡頭、材質和氛圍')}
 />
 </label>

 <div className="preset-row">
 {promptPresets.map((preset: string) => (
 <button key={preset} className="chip-button" type="button" onClick={() => handleApplyPromptPreset(preset)}>
 {preset}
 </button>
 ))}
 </div>

 <div className="field-row">
 <label className="field">
 <span>{t('field.ratio', '畫幅比例')}</span>
 <select value={aspectRatio} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAspectRatio(event.target.value)}>
 {ASPECT_RATIOS.map((ratio) => (
 <option key={ratio} value={ratio}>
 {ratio}
 </option>
 ))}
 </select>
 </label>

 <label className="field">
 <span>{t('field.count', '生成數量')}</span>
 <select value={count} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCount(Number(event.target.value))}>
 {RESULT_COUNTS.map((value) => (
 <option key={value} value={value}>
 {value}
 </option>
 ))}
 </select>
 </label>
 </div>

 <label className={`upload-zone ${referenceImage ? 'has-image' : ''}`}>
 <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileUpload} hidden />
 <div>
 <strong>{isEditMode ? t('field.uploadRequired', '上傳參考圖') : t('field.uploadOptional', '可選上傳')}</strong>
 <p>
 {isEditMode
 ? t('field.uploadHintEdit', '編輯模式必須提供原圖，支援 PNG / JPG / WebP。')
 : t('field.uploadHintText', '切換到編輯模型後會使用這裡的參考圖。')}
 </p>
 {referenceName ? <span className="upload-name">{t('field.currentFile', '目前檔案：')}{referenceName}</span> : null}
 </div>
 {referenceImage ? (
 <img src={referenceImage} alt={t('field.uploadRequired', '上傳參考圖')} />
 ) : (
 <div className="upload-placeholder">{t('field.uploadPlaceholder', '拖拽或點擊上傳')}</div>
 )}
 </label>

 {referenceImage ? (
 <div className="action-row compact-actions">
 <button
 className="secondary-button"
 type="button"
 onClick={() => {
 setReferenceImage(null);
 setReferenceName('');
 }}
 >
 {t('actions.clearImage', '清除參考圖')}
 </button>
 </div>
 ) : null}

 {error ? <div className="error-box">{error}</div> : null}
 {notice ? <div className="notice-box">{notice}</div> : null}

 <button className="submit-button" type="submit" disabled={isSubmitting}>
 {isSubmitting
 ? t('actions.submitting', '正在生成...')
 : isEditMode
 ? t('actions.submitEdit', '開始編輯圖片')
 : t('actions.submitText', '開始生成圖片')}
 </button>
 </form>

 <div className="side-stack">
 <aside className="panel tips-panel">
 <div className="panel-header compact">
 <div>
 <h2>{t('tips.title', '提示建議')}</h2>
 <p>{t('tips.subtitle', '更具體的描述通常能帶來更穩定的出圖結果。')}</p>
 </div>
 </div>
 <ul className="tips-list">
 {tipsItems.map((item: string) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 <div className="status-card">
 <span>{t('tips.currentModel', '目前模型')}</span>
 <strong>{currentModel.label}</strong>
 <p>{currentModelDescription}</p>
 </div>
 </aside>
 </div>
 </section>

 <section className="results-section">
 <div className="section-heading">
 <div>
 <span className="badge subtle">{t('gallery.badge', '創作記錄')}</span>
 <h2>{t('gallery.title', '結果畫廊')}</h2>
 </div>
 <div className="heading-actions">
 <p>
 {jobs.length
 ? tr(t, 'gallery.summary', '已生成 {count} 張圖片', {
 count: jobs.reduce((total: number, item: GenerationJob) => total + item.images.length,0),
 })
 : t('gallery.emptySubtitle', '提交一次任務後將在此顯示結果')}
 </p>
 {jobs.length ? (
 <button className="secondary-button" type="button" onClick={clearJobs}>
 {t('actions.clearJobs', '清空記錄')}
 </button>
 ) : null}
 </div>
 </div>

 {jobs.length ===0 ? (
 <div className="panel empty-state">
 <h3>{t('gallery.emptyTitle', '還沒有生成結果')}</h3>
 <p>{t('gallery.emptySubtitle', '填寫提示詞並點擊生成後，這裡會展示圖片、模型資訊與下載入口。')}</p>
 </div>
 ) : (
 <div className="jobs-list">
 {jobs.map((job: GenerationJob) => (
 <article key={job.id} className="panel job-card">
 <header className="job-header">
 <div>
 <div className="job-badges">
 <span className="badge subtle">{job.model}</span>
 {job.mode ? <span className="badge subtle">{formatMode(job.mode)}</span> : null}
 {job.favorite ? <span className="badge subtle">{t('job.favoriteBadge', '已收藏')}</span> : null}
 </div>
 <h3>{job.prompt}</h3>
 </div>
 <div className="job-meta">
 <span>{job.aspectRatio}</span>
 <span>{job.createdAt}</span>
 {job.referenceName ? <span>{t('job.reference', '參考圖：')}{job.referenceName}</span> : null}
 </div>
 </header>

 {job.providerMessage ? <p className="provider-message">{job.providerMessage}</p> : null}

 <div className="action-row wrap-actions">
 <button className="secondary-button" type="button" onClick={() => handleReuseJob(job)}>
 {t('actions.reuse', '復用參數')}
 </button>
 <button className="secondary-button" type="button" onClick={() => handleCopyPrompt(job.prompt)}>
 {t('actions.copyPrompt', '複製提示詞')}
 </button>
 <button className="secondary-button" type="button" onClick={() => toggleFavorite(job.id)}>
 {job.favorite ? t('actions.unfavorite', '取消收藏') : t('actions.favorite', '收藏結果')}
 </button>
 </div>

 <div className="image-grid">
 {job.images.map((imageUrl: string, index: number) => (
 <figure key={`${job.id}-${index}`} className="image-card">
 <button
 className="image-preview-button"
 type="button"
 onClick={() => setSelectedImage({ url: imageUrl, prompt: job.prompt })}
 >
 <img src={imageUrl} alt={`${job.prompt}-${index +1}`} loading="lazy" />
 </button>
 <figcaption>
 <span>
 {t('job.result', '結果')} {index +1}
 </span>
 <div className="image-card-actions">
 <a href={imageUrl} download={`grok-image-${job.id}-${index +1}.png`}>
 {t('actions.download', '下載')}
 </a>
 <button
 className="text-button"
 type="button"
 onClick={() => setSelectedImage({ url: imageUrl, prompt: job.prompt })}
 >
 {t('actions.preview', '預覽')}
 </button>
 </div>
 </figcaption>
 </figure>
 ))}
 </div>
 </article>
 ))}
 </div>
 )}
 </section>
 </main>

 {selectedImage ? (
 <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setSelectedImage(null)}>
 <div className="lightbox-card" onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}>
 <button className="lightbox-close" type="button" onClick={() => setSelectedImage(null)}>
 {t('actions.close', '關閉')}
 </button>
 <img src={selectedImage.url} alt={selectedImage.prompt} />
 <p>{selectedImage.prompt}</p>
 </div>
 </div>
 ) : null}
 </div>
 );
}

function formatMode(mode: string) {
 if (mode === 'openai-images') {
 return 'OpenAI Images';
 }

 if (mode === 'chat-completions') {
 return 'Chat Completions';
 }

 return mode;
}

function readStorage<T>(key: string, fallback: T) {
 if (typeof window === 'undefined') {
 return fallback;
 }

 try {
 const value = window.localStorage.getItem(key);
 return value ? (JSON.parse(value) as T) : fallback;
 } catch {
 return fallback;
 }
}

function writeStorage(key: string, value: unknown) {
 if (typeof window === 'undefined') {
 return;
 }

 window.localStorage.setItem(key, JSON.stringify(value));
}

function readFileAsDataUrl(file: File) {
 return new Promise<string>((resolve, reject) => {
 const reader = new FileReader();

 reader.onload = () => {
 if (typeof reader.result === 'string') {
 resolve(reader.result);
 return;
 }

 reject(new Error('文件读取失败。'));
 };

 reader.onerror = () => reject(new Error('文件读取失败。'));
 reader.readAsDataURL(file);
 });
}
