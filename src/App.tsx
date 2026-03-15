import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

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
const ASPECT_RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16', '21:9'];
const RESULT_COUNTS = [1, 2, 3, 4];
const PROMPT_PRESETS = [
  '电影感，体积光，超高细节，真实材质',
  '极简海报设计，干净留白，现代排版感',
  '赛博朋克夜景，霓虹反射，雨夜街头，广角镜头',
  '高端产品渲染，工作室打光，纯净背景',
  '日系插画，柔和光影，细腻笔触，氛围感强',
  '保留主体结构，只修改配色、服装与背景风格',
];
const DEFAULT_SETTINGS: ApiSettings = {
  apiUrl: 'https://mpp.pp.ua/v1/chat/completions',
  apiKey: '',
  compatibility: 'auto',
};

export default function App() {
  const [model, setModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('一只戴着透明宇航头盔的布偶猫，站在霓虹城市屋顶，电影感灯光，超高细节');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [count, setCount] = useState(1);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState('');
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; prompt: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState<ApiSettings>(() => readStorage<ApiSettings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));

  const currentModel = useMemo(() => MODELS.find((item) => item.id === model) ?? MODELS[0], [model]);
  const isEditMode = model.toLowerCase().includes('edit');
  const favoriteCount = jobs.filter((job) => job.favorite).length;

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
    setPrompt((current) => (current ? `${current}，${preset}` : preset));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim()) {
      setError('请输入提示词。');
      return;
    }

    if (isEditMode && !referenceImage) {
      setError('编辑模式需要先上传参考图。');
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
        throw new Error(result.error || '生成失败，请稍后重试。');
      }

      const newJob: GenerationJob = {
        id: crypto.randomUUID(),
        model,
        prompt,
        aspectRatio,
        createdAt: new Date().toLocaleString('zh-CN'),
        images: result.images,
        providerMessage: result.providerMessage,
        mode: result.mode,
        endpoint: result.endpoint,
        referenceName: referenceName || undefined,
        favorite: false,
      };

      setJobs((current) => [newJob, ...current]);
      setNotice(`已完成 ${result.images.length} 张图片生成。`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '请求失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReuseJob = (job: GenerationJob) => {
    setModel(job.model);
    setPrompt(job.prompt);
    setAspectRatio(job.aspectRatio);
    setNotice('已将该任务参数填回创作面板。');
    setError('');
  };

  const handleCopyPrompt = async (jobPrompt: string) => {
    try {
      await navigator.clipboard.writeText(jobPrompt);
      setNotice('提示词已复制。');
      setError('');
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限。');
    }
  };

  const toggleFavorite = (jobId: string) => {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, favorite: !job.favorite } : job)));
  };

  const clearJobs = () => {
    setJobs([]);
    setNotice('已清空当前结果记录。');
    setError('');
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setNotice('已恢复默认接口配置。');
    setError('');
  };

  return (
    <div className="app-shell">
      <div className="background-orb orb-1" />
      <div className="background-orb orb-2" />
      <main className="page">
        <section className="hero">
          <div>
            <span className="badge">Cloudflare Ready</span>
            <h1>Grok Draw Studio</h1>
            <p className="hero-copy">
              面向 `Grok-Imagine` 与 OpenAI 兼容图片接口的绘图工作台，支持文生图、参考图编辑、自定义 API Key、结果放大预览与任务复用。
            </p>
          </div>
          <div className="hero-stats">
            <article>
              <strong>{MODELS.length}</strong>
              <span>内置模型</span>
            </article>
            <article>
              <strong>{jobs.length}</strong>
              <span>当前任务记录</span>
            </article>
            <article>
              <strong>{favoriteCount}</strong>
              <span>收藏作品</span>
            </article>
          </div>
        </section>

        <section className="workspace-grid">
          <form className="panel form-panel" onSubmit={handleSubmit}>
            <div className="panel-header">
              <div>
                <h2>创作面板</h2>
                <p>{currentModel.description}</p>
              </div>
              <span className="mode-pill">{isEditMode ? '参考图编辑' : '文本生成'}</span>
            </div>

            <label className="field">
              <span>模型</span>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>提示词</span>
              <textarea
                rows={6}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="描述你想生成或编辑的画面内容、风格、镜头、材质和氛围"
              />
            </label>

            <div className="preset-row">
              {PROMPT_PRESETS.map((preset) => (
                <button key={preset} className="chip-button" type="button" onClick={() => handleApplyPromptPreset(preset)}>
                  {preset}
                </button>
              ))}
            </div>

            <div className="field-row">
              <label className="field">
                <span>画幅比例</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>生成数量</span>
                <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  {RESULT_COUNTS.map((value) => (
                    <option key={value} value={value}>
                      {value} 张
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={`upload-zone ${referenceImage ? 'has-image' : ''}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                hidden
              />
              <div>
                <strong>{isEditMode ? '上传参考图' : '可选上传'}</strong>
                <p>{isEditMode ? '编辑模式必须提供原图，支持 PNG / JPG / WebP。' : '切换到编辑模型后会使用这里的参考图。'}</p>
                {referenceName ? <span className="upload-name">当前文件：{referenceName}</span> : null}
              </div>
              {referenceImage ? <img src={referenceImage} alt="参考图预览" /> : <div className="upload-placeholder">拖拽或点击上传</div>}
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
                  清除参考图
                </button>
              </div>
            ) : null}

            {error ? <div className="error-box">{error}</div> : null}
            {notice ? <div className="notice-box">{notice}</div> : null}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '正在生成...' : isEditMode ? '开始编辑图片' : '开始生成图片'}
            </button>
          </form>

          <div className="side-stack">
            <aside className="panel tips-panel">
              <div className="panel-header compact">
                <div>
                  <h2>接口设置</h2>
                  <p>支持默认接口，也支持手动切换到 OpenAI 兼容图片接口。</p>
                </div>
              </div>

              <label className="field">
                <span>兼容模式</span>
                <select
                  value={settings.compatibility}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      compatibility: event.target.value as ApiCompatibility,
                    }))
                  }
                >
                  <option value="auto">自动识别</option>
                  <option value="chat-completions">Chat Completions</option>
                  <option value="openai-images">OpenAI Images</option>
                </select>
              </label>

              <label className="field">
                <span>API 地址</span>
                <input
                  value={settings.apiUrl}
                  onChange={(event) => setSettings((current) => ({ ...current, apiUrl: event.target.value }))}
                  placeholder="例如 https://api.openai.com/v1 或具体接口地址"
                />
              </label>

              <label className="field">
                <span>API Key</span>
                <div className="secret-row">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    onChange={(event) => setSettings((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="留空时使用服务端默认 Key"
                  />
                  <button className="secondary-button" type="button" onClick={() => setShowApiKey((current) => !current)}>
                    {showApiKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </label>

              <div className="hint-card">
                <strong>说明</strong>
                <p>自定义 API Key 仅保存在当前浏览器本地，并通过本站后端代理转发，不会写回仓库文件。</p>
              </div>

              <div className="action-row">
                <button className="secondary-button" type="button" onClick={resetSettings}>
                  恢复默认设置
                </button>
              </div>
            </aside>

            <aside className="panel tips-panel">
              <div className="panel-header compact">
                <div>
                  <h2>提示建议</h2>
                  <p>更具体的描述通常能带来更稳定的出图结果。</p>
                </div>
              </div>
              <ul className="tips-list">
                <li>主体 + 场景 + 风格 + 灯光 + 镜头语言，效果最稳定。</li>
                <li>`Fast` 模型适合快速草图，`Edit` 模型适合二次创作。</li>
                <li>OpenAI 图片接口更适合标准 `data[].url / b64_json` 返回。</li>
                <li>点击结果图可放大预览，卡片支持收藏、复制提示词、复用任务。</li>
              </ul>
              <div className="status-card">
                <span>当前模型</span>
                <strong>{currentModel.label}</strong>
                <p>{currentModel.description}</p>
              </div>
            </aside>
          </div>
        </section>

        <section className="results-section">
          <div className="section-heading">
            <div>
              <span className="badge subtle">创作记录</span>
              <h2>结果画廊</h2>
            </div>
            <div className="heading-actions">
              <p>{jobs.length ? `已生成 ${jobs.reduce((total, item) => total + item.images.length, 0)} 张图片` : '提交一次任务后将在这里展示结果'}</p>
              {jobs.length ? (
                <button className="secondary-button" type="button" onClick={clearJobs}>
                  清空记录
                </button>
              ) : null}
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="panel empty-state">
              <h3>还没有生成结果</h3>
              <p>填写提示词并点击生成后，这里会展示图片、模型信息与下载入口。</p>
            </div>
          ) : (
            <div className="jobs-list">
              {jobs.map((job) => (
                <article key={job.id} className="panel job-card">
                  <header className="job-header">
                    <div>
                      <div className="job-badges">
                        <span className="badge subtle">{job.model}</span>
                        {job.mode ? <span className="badge subtle">{formatMode(job.mode)}</span> : null}
                        {job.favorite ? <span className="badge subtle">已收藏</span> : null}
                      </div>
                      <h3>{job.prompt}</h3>
                    </div>
                    <div className="job-meta">
                      <span>{job.aspectRatio}</span>
                      <span>{job.createdAt}</span>
                      {job.referenceName ? <span>参考图：{job.referenceName}</span> : null}
                    </div>
                  </header>

                  {job.providerMessage ? <p className="provider-message">{job.providerMessage}</p> : null}
                  {job.endpoint ? <p className="endpoint-line">接口：{job.endpoint}</p> : null}

                  <div className="action-row wrap-actions">
                    <button className="secondary-button" type="button" onClick={() => handleReuseJob(job)}>
                      复用参数
                    </button>
                    <button className="secondary-button" type="button" onClick={() => handleCopyPrompt(job.prompt)}>
                      复制提示词
                    </button>
                    <button className="secondary-button" type="button" onClick={() => toggleFavorite(job.id)}>
                      {job.favorite ? '取消收藏' : '收藏结果'}
                    </button>
                  </div>

                  <div className="image-grid">
                    {job.images.map((imageUrl, index) => (
                      <figure key={`${job.id}-${index}`} className="image-card">
                        <button className="image-preview-button" type="button" onClick={() => setSelectedImage({ url: imageUrl, prompt: job.prompt })}>
                          <img src={imageUrl} alt={`${job.prompt}-${index + 1}`} loading="lazy" />
                        </button>
                        <figcaption>
                          <span>结果 {index + 1}</span>
                          <div className="image-card-actions">
                            <a href={imageUrl} download={`grok-image-${job.id}-${index + 1}.png`}>
                              下载
                            </a>
                            <button className="text-button" type="button" onClick={() => setSelectedImage({ url: imageUrl, prompt: job.prompt })}>
                              预览
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
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox-close" type="button" onClick={() => setSelectedImage(null)}>
              关闭
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
