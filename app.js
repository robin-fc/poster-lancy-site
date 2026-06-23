/**
 * AI 生图助手 - ChatGPT 风格生图流程
 * 核心流程：用户输入 → 对话模型理解/增强提示词 → 生图模型生成图片 → 多轮迭代
 */

// ===== 默认系统提示词 =====
const DEFAULT_SYSTEM_PROMPT = `你是一位专业的 AI 图像生成提示词工程师，你的角色类似于 ChatGPT 的生图流程中连接用户与图像生成模型的中间层。

## 你的核心职责

### 1. 提示词理解
准确理解用户的生图需求，即使用户的描述很简短、模糊或使用任何语言。理解他们真正想要创建什么样的图像。

### 2. 上下文整合
充分考虑完整的对话历史。如果用户引用了之前的图片（例如"把背景改成蓝色"、"换个风格"、"再来一张但换成狗"），你应该基于上一轮的提示词进行修改，保持一致性。对话历史中包含了之前每一轮的增强提示词，你可以直接引用和修改。

### 3. 提示词增强
将简单的请求转化为详细、有效的图像生成提示词。添加相关细节：
- 主体描述（外观、姿态、表情、穿着等）
- 艺术风格（写实照片、插画、油画、水彩、3D渲染等）
- 构图（角度、取景、透视）
- 光线（自然光、影棚光、戏剧性光线、柔和光线）
- 色彩方案
- 氛围与情绪
- 细节程度

### 4. 参数选择
根据当前使用的图像生成 API 格式，选择合适的参数：

#### 如果是 OpenAI 格式（gpt-image-1, dall-e-3 等）：
- size: "1024x1024"（正方形）、"1792x1024"（横向风景）、"1024x1792"（纵向人物/建筑）
- quality: "standard"（标准）或 "hd"（高清，适合需要精细细节的场景）
- style: "vivid"（鲜明，适合艺术创作）或 "natural"（自然，适合写实照片）

#### 如果是 grsai 格式（gpt-image-2 等）：
- aspectRatio: 支持比例或像素值
  - 比例: "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "9:21", "1:2", "2:1", "auto"
  - 像素值: "1024x1024" 等
- quality: 可选 "auto", "low", "medium", "high"

#### 如果是 agnes 格式（agnes-image-2.0-flash 等）：
- size: "1024x1024"、"1024x768"、"768x1024" 等
- 当用户上传了参考图片或引用了之前的生成结果时，系统会自动走图生图模式（传入 image 数组），你需要在 prompt 中描述如何编辑/转换输入图片

### 5. 图生图与多轮引用
- 当用户上传了附件图片时，这是图生图请求。你的 prompt 应该描述如何基于输入图片进行编辑或转换，而不是从零生成
- 当用户引用了之前的生成结果（如"把刚才那张图的背景换成蓝色"），系统也会自动走图生图模式，传入之前的图片作为参考
- 图生图的 prompt 结构：[编辑指令] + [需要保留的元素] + [目标风格/场景] + [光线] + [构图] + [质量要求]
- 多图合成时，描述不同输入图像之间的关系

### 6. 多轮修正
当用户提供反馈或修正意见时，调整提示词以解决他们的问题，同时保持他们满意的部分。例如用户说"太卡通了"，你应该将风格调整为更写实。

## 输出格式

你必须以 JSON 对象格式回复，不要包含任何其他文本。

### OpenAI 格式时输出：
{
  "analysis": "简要分析用户的请求以及你如何处理它（用用户的语言回复）",
  "prompt": "增强后的详细英文提示词，用于图像生成模型",
  "parameters": {
    "size": "1024x1024",
    "quality": "standard",
    "style": "vivid"
  }
}

### grsai 格式时输出：
{
  "analysis": "简要分析用户的请求以及你如何处理它（用用户的语言回复）",
  "prompt": "增强后的详细英文提示词，用于图像生成模型",
  "parameters": {
    "aspectRatio": "16:9",
    "quality": "auto"
  }
}

## 重要规则
- prompt 字段必须使用英文，以获得最佳图像生成效果
- analysis 字段使用与用户相同的语言
- 如果用户的请求不明确，做出合理的假设并在 analysis 中说明
- 对于迭代请求，明确修改之前的提示词而不是从零开始
- analysis 要简洁但信息丰富
- 不要在 JSON 之外输出任何内容
- 请根据系统会告知你的当前 API 格式来选择合适的参数`;

// ===== 服务商注册表 =====
// 每个服务商定义对话/生图的 URL、格式、可选模型
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    chat: {
      url: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
    },
    image: {
      url: 'https://api.openai.com/v1/images/generations',
      format: 'openai',
      models: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    },
  },
  grsai: {
    name: 'grsai（国内节点）',
    chat: {
      url: 'https://grsai.dakka.com.cn/v1/chat/completions',
      models: ['gpt-5.5', 'gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'deepseek-chat'],
    },
    image: {
      url: 'https://grsai.dakka.com.cn/v1/draw/completions',
      format: 'grsai',
      models: ['gpt-image-2', 'gpt-image-2-vip'],
    },
  },
  grsai_global: {
    name: 'grsai（全球节点）',
    chat: {
      url: 'https://grsaiapi.com/v1/chat/completions',
      models: ['gpt-5.5', 'gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'deepseek-chat'],
    },
    image: {
      url: 'https://grsaiapi.com/v1/draw/completions',
      format: 'grsai',
      models: ['gpt-image-2', 'gpt-image-2-vip'],
    },
  },
  agnes: {
    name: 'Agnes AI（免费）',
    chat: {
      url: 'https://apihub.agnes-ai.com/v1/chat/completions',
      models: ['agnes-2.0-flash'],
    },
    image: {
      url: 'https://apihub.agnes-ai.com/v1/images/generations',
      format: 'agnes',
      models: ['agnes-image-2.0-flash', 'agnes-image-2.1-flash'],
    },
  },
  custom: {
    name: '自定义',
    chat: {
      url: '',
      models: [],
    },
    image: {
      url: '',
      format: 'openai',
      models: [],
    },
  },
};

// ===== 状态管理 =====
const state = {
  config: {
    chatProvider: 'grsai',
    chatCustomUrl: '',
    chatApiKey: '',
    chatModel: 'gpt-5.5',
    chatTimeout: 60,
    chatTemperature: 0.7,
    imageProvider: 'grsai',
    imageCustomUrl: '',
    imageCustomFormat: 'openai',
    imageApiKey: '',
    imageModel: 'gpt-image-2',
    imageTimeout: 120,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  messages: [],       // 完整对话历史 {role, content, type, data}
  chatHistory: [],    // 发送给对话模型的历史 {role, content}
  isProcessing: false,
  currentImage: null, // 当前预览的图片
  pendingAttachments: [], // 待发送的附件 {dataUrl, name, isRef}
};

// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);
const els = {
  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebar-overlay'),
  toggleSidebar: $('toggle-sidebar'),
  closeSidebar: $('close-sidebar'),
  messages: $('messages'),
  userInput: $('user-input'),
  sendBtn: $('send-btn'),
  clearChat: $('clear-chat'),
  statusIndicator: $('status-indicator'),
  // 配置字段
  chatProvider: $('chat-provider'),
  chatCustomUrlField: $('chat-custom-url-field'),
  chatCustomUrl: $('chat-custom-url'),
  chatApiKey: $('chat-api-key'),
  chatModel: $('chat-model'),
  chatModelCustom: $('chat-model-custom'),
  chatModelHint: $('chat-model-hint'),
  chatTimeout: $('chat-timeout'),
  chatTemperature: $('chat-temperature'),
  chatTemperatureVal: $('chat-temperature-val'),
  imageProvider: $('image-provider'),
  imageProviderHint: $('image-provider-hint'),
  imageCustomUrlField: $('image-custom-url-field'),
  imageCustomUrl: $('image-custom-url'),
  imageCustomFormatField: $('image-custom-format-field'),
  imageCustomFormat: $('image-custom-format'),
  imageApiKey: $('image-api-key'),
  imageModel: $('image-model'),
  imageModelCustom: $('image-model-custom'),
  imageModelHint: $('image-model-hint'),
  imageTimeout: $('image-timeout'),
  systemPrompt: $('system-prompt'),
  saveConfig: $('save-config'),
  resetPrompt: $('reset-prompt'),
  exportConfig: $('export-config'),
  exportChat: $('export-chat'),
  // 弹窗
  imageModal: $('image-modal'),
  modalImage: $('modal-image'),
  modalPrompt: $('modal-prompt'),
  modalDownload: $('modal-download'),
  // 其他
  contextInfo: $('context-info'),
  toastContainer: $('toast-container'),
  // 附件
  attachBtn: $('attach-btn'),
  fileInput: $('file-input'),
  attachmentPreview: $('attachment-preview'),
};

// ===== 配置管理 =====
function loadConfig() {
  try {
    const saved = localStorage.getItem('ai-image-config');
    if (saved) {
      Object.assign(state.config, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('加载配置失败:', e);
  }
  // 同步到 UI
  populateProviderDropdowns();
  els.chatProvider.value = state.config.chatProvider;
  applyChatProvider();
  els.chatCustomUrl.value = state.config.chatCustomUrl;
  els.chatApiKey.value = state.config.chatApiKey;
  els.chatTimeout.value = state.config.chatTimeout;
  els.chatTemperature.value = state.config.chatTemperature;
  els.chatTemperatureVal.textContent = state.config.chatTemperature;
  els.imageProvider.value = state.config.imageProvider;
  applyImageProvider();
  els.imageCustomUrl.value = state.config.imageCustomUrl;
  els.imageCustomFormat.value = state.config.imageCustomFormat;
  els.imageApiKey.value = state.config.imageApiKey;
  els.imageTimeout.value = state.config.imageTimeout;
  els.systemPrompt.value = state.config.systemPrompt;
  // 设置模型选中值（populate 之后）
  setTimeout(() => {
    setModelSelection(els.chatModel, state.config.chatModel, els.chatModelCustom);
    setModelSelection(els.imageModel, state.config.imageModel, els.imageModelCustom);
  }, 0);
  updateStatusIndicator();
}

function setModelSelection(selectEl, model, customInputEl) {
  // 如果模型在列表中，选中它；否则添加一个自定义选项
  const exists = Array.from(selectEl.options).some(o => o.value === model);
  if (!exists && model) {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model + '（自定义）';
    const customOpt = selectEl.querySelector('option[value="__custom__"]');
    if (customOpt) {
      selectEl.insertBefore(opt, customOpt);
    } else {
      selectEl.appendChild(opt);
    }
  }
  selectEl.value = model;
  if (customInputEl) customInputEl.style.display = 'none';
}

function populateProviderDropdowns() {
  // 对话服务商
  els.chatProvider.innerHTML = '';
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    els.chatProvider.appendChild(opt);
  }
  // 生图服务商
  els.imageProvider.innerHTML = '';
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    els.imageProvider.appendChild(opt);
  }
}

function applyChatProvider() {
  const providerId = els.chatProvider.value;
  const provider = PROVIDERS[providerId];
  // 更新模型列表
  els.chatModel.innerHTML = '';
  provider.chat.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    els.chatModel.appendChild(opt);
  });
  // 自定义模型选项
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '✏️ 自定义...';
  els.chatModel.appendChild(customOpt);
  // 自定义 URL 输入框
  if (providerId === 'custom') {
    els.chatCustomUrlField.style.display = '';
  } else {
    els.chatCustomUrlField.style.display = 'none';
  }
  // 恢复自定义输入框隐藏状态
  els.chatModelCustom.style.display = 'none';
  els.chatModel.style.display = '';
}

function applyImageProvider() {
  const providerId = els.imageProvider.value;
  const provider = PROVIDERS[providerId];
  // 更新模型列表
  els.imageModel.innerHTML = '';
  provider.image.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    els.imageModel.appendChild(opt);
  });
  // 自定义模型选项
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '✏️ 自定义...';
  els.imageModel.appendChild(customOpt);
  // 提示信息
  if (providerId === 'custom') {
    els.imageProviderHint.textContent = '自定义：需手动填写 URL 和 API 格式';
    els.imageCustomUrlField.style.display = '';
    els.imageCustomFormatField.style.display = '';
  } else {
    const fmt = provider.image.format;
    if (fmt === 'grsai') {
      els.imageProviderHint.textContent = `${provider.name}：POST ${provider.image.url}，参数 aspectRatio, quality，支持图生图（urls）`;
    } else if (fmt === 'agnes') {
      els.imageProviderHint.textContent = `${provider.name}：POST ${provider.image.url}，参数 size，支持图生图（extra_body.image 数组）`;
    } else {
      els.imageProviderHint.textContent = `${provider.name}：POST ${provider.image.url}，参数 size, quality, style`;
    }
    els.imageCustomUrlField.style.display = 'none';
    els.imageCustomFormatField.style.display = 'none';
  }
  // 恢复自定义输入框隐藏状态
  els.imageModelCustom.style.display = 'none';
  els.imageModel.style.display = '';
}

/**
 * 切换模型选择器和自定义输入框
 */
function setupModelCombo(selectEl, inputEl, hintEl) {
  selectEl.addEventListener('change', () => {
    if (selectEl.value === '__custom__') {
      selectEl.style.display = 'none';
      inputEl.style.display = '';
      inputEl.value = '';
      inputEl.focus();
      if (hintEl) hintEl.textContent = '输入自定义模型名称后按 Tab 或点击外部确认';
    }
  });

  inputEl.addEventListener('blur', () => {
    const val = inputEl.value.trim();
    if (val) {
      // 如果已存在该选项则选中，否则添加
      let opt = Array.from(selectEl.options).find(o => o.value === val);
      if (!opt) {
        opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val + '（自定义）';
        // 插入到自定义选项之前
        const customOpt = selectEl.querySelector('option[value="__custom__"]');
        selectEl.insertBefore(opt, customOpt);
      }
      selectEl.value = val;
    }
    inputEl.style.display = 'none';
    selectEl.style.display = '';
    if (hintEl) hintEl.textContent = '从列表选择，或点右侧输入框输入自定义名称';
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      inputEl.blur();
    }
  });
}

/**
 * 获取当前选中的模型名称（支持下拉或自定义）
 */
function getChatModel() {
  if (els.chatModelCustom.style.display !== 'none') {
    return els.chatModelCustom.value.trim();
  }
  const val = els.chatModel.value;
  return val === '__custom__' ? '' : val;
}

function getImageModel() {
  if (els.imageModelCustom.style.display !== 'none') {
    return els.imageModelCustom.value.trim();
  }
  const val = els.imageModel.value;
  return val === '__custom__' ? '' : val;
}

/**
 * 获取当前对话模型的有效 URL
 */
function getChatUrl() {
  const provider = PROVIDERS[state.config.chatProvider];
  if (state.config.chatProvider === 'custom') {
    return state.config.chatCustomUrl;
  }
  return provider.chat.url;
}

/**
 * 获取当前生图模型的有效 URL 和格式
 */
function getImageConfig() {
  const provider = PROVIDERS[state.config.imageProvider];
  if (state.config.imageProvider === 'custom') {
    return {
      url: state.config.imageCustomUrl,
      format: state.config.imageCustomFormat,
    };
  }
  return {
    url: provider.image.url,
    format: provider.image.format,
  };
}

function saveConfig() {
  state.config.chatProvider = els.chatProvider.value;
  state.config.chatCustomUrl = els.chatCustomUrl.value.trim();
  state.config.chatApiKey = els.chatApiKey.value.trim();
  state.config.chatModel = getChatModel();
  state.config.chatTimeout = parseInt(els.chatTimeout.value) || 60;
  state.config.chatTemperature = parseFloat(els.chatTemperature.value) || 0.7;
  state.config.imageProvider = els.imageProvider.value;
  state.config.imageCustomUrl = els.imageCustomUrl.value.trim();
  state.config.imageCustomFormat = els.imageCustomFormat.value;
  state.config.imageApiKey = els.imageApiKey.value.trim();
  state.config.imageModel = getImageModel();
  state.config.imageTimeout = parseInt(els.imageTimeout.value) || 120;
  state.config.systemPrompt = els.systemPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT;

  try {
    localStorage.setItem('ai-image-config', JSON.stringify(state.config));
    showToast('配置已保存', 'success');
    updateStatusIndicator();
  } catch (e) {
    showToast('保存配置失败: ' + e.message, 'error');
  }
}

function updateStatusIndicator() {
  const configured = state.config.chatApiKey && state.config.imageApiKey;
  els.statusIndicator.classList.toggle('configured', !!configured);
  els.statusIndicator.title = configured ? '已配置' : '未配置 API Key';
  els.sendBtn.disabled = !configured || state.isProcessing;
}

// ===== Toast 通知 =====
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== API 调用 =====

/**
 * 调用对话模型，获取增强后的提示词
 */
async function callChatModel(messages) {
  const url = getChatUrl();
  const timeoutMs = state.config.chatTimeout * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.config.chatApiKey}`,
      },
      body: JSON.stringify({
        model: state.config.chatModel,
        messages: messages,
        temperature: state.config.chatTemperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('对话模型返回空内容');
    }

    return content;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`对话模型请求超时（${state.config.chatTimeout}秒）`);
    }
    throw error;
  }
}

/**
 * 调用图像生成模型 - 根据 API 格式分发
 */
async function callImageModel(prompt, params, images) {
  const imgConfig = getImageConfig();
  if (imgConfig.format === 'grsai') {
    return callGrsaiImageModel(prompt, params, imgConfig.url, images);
  }
  if (imgConfig.format === 'agnes') {
    return callAgnesImageModel(prompt, params, imgConfig.url, images);
  }
  // openai 格式
  return callOpenAIImageModel(prompt, params, imgConfig.url);
}

/**
 * Agnes 格式图像生成（/v1/images/generations）
 * 支持文生图和图生图（通过 image 数组传入参考图片）
 * 文档：https://agnes-ai.com/doc/agnes-image-20-flash
 */
async function callAgnesImageModel(prompt, params, url, images) {
  const timeoutMs = state.config.imageTimeout * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 构建请求体
  const body = {
    model: state.config.imageModel,
    prompt: prompt,
    size: params.size || '1024x1024',
  };

  // 图生图：传入 image 数组（公网 URL 或 Data URI Base64）
  if (images && images.length > 0) {
    body.extra_body = {
      image: images,
      response_format: 'b64_json',
    };
  } else {
    // 文生图：使用 return_base64 获取 Base64
    body.return_base64 = true;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.config.imageApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new Error('图像模型返回空数据');
    }

    if (imageData.b64_json) {
      return {
        base64: imageData.b64_json,
        dataUrl: `data:image/png;base64,${imageData.b64_json}`,
        revisedPrompt: imageData.revised_prompt || null,
      };
    } else if (imageData.url) {
      return {
        url: imageData.url,
        dataUrl: imageData.url,
        revisedPrompt: imageData.revised_prompt || null,
      };
    } else {
      throw new Error('图像模型返回格式未知');
    }
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`图像生成请求超时（${state.config.imageTimeout}秒）`);
    }
    throw error;
  }
}

/**
 * OpenAI 格式图像生成（/images/generations）
 */
async function callOpenAIImageModel(prompt, params, url) {
  const timeoutMs = state.config.imageTimeout * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 构建请求体，根据模型类型调整参数
  const body = {
    model: state.config.imageModel,
    prompt: prompt,
    n: 1,
  };

  const model = state.config.imageModel.toLowerCase();
  if (params.size) body.size = params.size;
  if (params.quality) body.quality = params.quality;
  if (params.style && model.includes('dall-e')) {
    body.style = params.style;
  }

  if (model.includes('gpt-image')) {
    // gpt-image-1 默认返回 b64_json
  } else if (model.includes('dall-e-3')) {
    body.response_format = 'b64_json';
  } else if (model.includes('dall-e-2')) {
    body.response_format = 'b64_json';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.config.imageApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new Error('图像模型返回空数据');
    }

    if (imageData.b64_json) {
      return {
        base64: imageData.b64_json,
        dataUrl: `data:image/png;base64,${imageData.b64_json}`,
        revisedPrompt: imageData.revised_prompt || null,
      };
    } else if (imageData.url) {
      return {
        url: imageData.url,
        dataUrl: imageData.url,
        revisedPrompt: imageData.revised_prompt || null,
      };
    } else {
      throw new Error('图像模型返回格式未知');
    }
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`图像生成请求超时（${state.config.imageTimeout}秒）`);
    }
    throw error;
  }
}

/**
 * grsai 格式图像生成（POST /v1/draw/completions）
 * 使用 webHook: -1 获取任务 ID，然后轮询 POST /v1/draw/result
 */
async function callGrsaiImageModel(prompt, params, generateUrl, images) {
  // 轮询接口：把 /completions 替换为 /result
  const resultUrl = generateUrl.replace('/completions', '/result');
  const timeoutMs = state.config.imageTimeout * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 构建 grsai 请求体
  const body = {
    model: state.config.imageModel,
    prompt: prompt,
    urls: images || [],
    shutProgress: true,
    webHook: '-1',
  };

  // 参数
  if (params.aspectRatio) body.aspectRatio = params.aspectRatio;
  if (params.quality) body.quality = params.quality;

  try {
    // 步骤 1：提交生成请求
    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.config.imageApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorJson.message || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const submitResult = await response.json();

    // 解析 {code, msg, data: {id}} 格式
    if (submitResult.code !== 0) {
      clearTimeout(timer);
      throw new Error(submitResult.msg || 'grsai 提交失败');
    }
    const taskId = submitResult.data?.id;
    if (!taskId) {
      clearTimeout(timer);
      throw new Error('grsai 提交成功但未返回任务 ID');
    }

    // 步骤 2：轮询获取结果
    return await pollGrsaiResult(resultUrl, taskId, controller, timer);

  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`图像生成请求超时（${state.config.imageTimeout}秒）`);
    }
    throw error;
  }
}

/**
 * 轮询 grsai 异步任务结果（POST /v1/draw/result）
 */
async function pollGrsaiResult(resultUrl, taskId, parentController, parentTimer) {
  const maxAttempts = 60;
  const intervalMs = 3000;
  let lastProgress = 0;

  for (let i = 0; i < maxAttempts; i++) {
    if (parentController.signal.aborted) {
      throw new Error(`图像生成请求超时（${state.config.imageTimeout}秒）`);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));

    const response = await fetch(resultUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.config.imageApiKey}`,
      },
      body: JSON.stringify({ id: taskId }),
      signal: parentController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `轮询失败 HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorJson.message || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();

    // 解析 {code, msg, data: {status, results, progress, failure_reason, error}}
    if (result.code !== 0 && result.code !== -22) {
      throw new Error(result.msg || 'grsai 查询失败');
    }

    const taskData = result.data;
    if (!taskData) {
      continue; // 无数据继续轮询
    }

    // 显示进度
    if (taskData.progress !== undefined && taskData.progress !== lastProgress) {
      lastProgress = taskData.progress;
    }

    if (taskData.status === 'succeeded') {
      clearTimeout(parentTimer);
      const imageUrl = taskData.results?.[0]?.url;
      if (!imageUrl) {
        throw new Error('grsai 生成成功但无图片 URL');
      }
      return {
        url: imageUrl,
        dataUrl: imageUrl,
        revisedPrompt: null,
      };
    } else if (taskData.status === 'failed') {
      clearTimeout(parentTimer);
      const reason = taskData.failure_reason ? `（${taskData.failure_reason}）` : '';
      throw new Error(`grsai 图像生成失败${reason}: ${taskData.error || '未知错误'}`);
    }
    // status === 'running' 或无 status 继续轮询
  }

  clearTimeout(parentTimer);
  throw new Error('grsai 图像生成超时（轮询 60 次未完成）');
}

/**
 * 解析对话模型的 JSON 响应
 */
function parseChatResponse(content) {
  // 尝试直接解析 JSON
  try {
    return JSON.parse(content);
  } catch (e) {
    // 尝试从文本中提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // 仍然失败，返回原始文本作为 prompt
        return {
          analysis: '模型返回格式异常，使用原始文本作为提示词',
          prompt: content.trim(),
          parameters: {
            size: '1024x1024',
            quality: 'standard',
            style: 'vivid',
          },
        };
      }
    }
    return {
      analysis: '模型返回格式异常，使用原始文本作为提示词',
      prompt: content.trim(),
      parameters: {
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      },
    };
  }
}

// ===== 聊天流程 =====

/**
 * 发送消息的完整流程
 */
async function sendMessage(userText) {
  if (state.isProcessing || !userText.trim()) return;

  // 收集当前附件（发送时快照）
  const attachments = [...state.pendingAttachments];
  const hasImages = attachments.length > 0;

  // 隐藏欢迎屏
  const welcome = $('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  // 添加用户消息到 UI（含附件预览）
  const userMsgEl = addMessageToUI('user', userText, attachments);

  // 构建发送给对话模型的用户内容（包含图片说明）
  let chatContent = userText;
  if (hasImages) {
    const imgDescs = attachments.map((a, i) => `[参考图片${i + 1}]`).join('、');
    chatContent = `${userText}\n\n[本次请求包含${imgDescs}，请走图生图模式，prompt 描述如何编辑/转换输入图片]`;
  }

  state.messages.push({ role: 'user', content: userText, type: 'text', attachments });
  state.chatHistory.push({ role: 'user', content: chatContent });

  // 清空输入和附件
  els.userInput.value = '';
  state.pendingAttachments = [];
  renderAttachmentPreview();
  autoResizeTextarea();
  updateContextInfo();

  // 开始处理
  state.isProcessing = true;
  updateStatusIndicator();
  els.sendBtn.classList.add('loading');

  // 创建助手消息容器
  const assistantEl = createAssistantMessage();
  const stepsEl = assistantEl.querySelector('.processing-steps');
  let currentStep = 0;
  let parsed = undefined;
  let imageInputs = [];

  try {
    // 步骤 1：调用对话模型增强提示词
    currentStep = 0;
    updateStep(stepsEl, 0, 'active', '正在理解您的需求并增强提示词...');

    const imgCfg = getImageConfig();
    const formatDesc = imgCfg.format === 'grsai'
      ? 'grsai（使用 aspectRatio 参数，如 1:1, 16:9, 9:16, 1024x1024 等；支持 quality: auto/low/medium/high；图生图通过 urls 传入图片）'
      : imgCfg.format === 'agnes'
        ? 'agnes（使用 size 参数，如 1024x1024、1024x768、768x1024；图生图通过 extra_body.image 数组传入图片；response_format 必须放在 extra_body 中）'
        : 'OpenAI 兼容格式（使用 size, quality, style 参数）';
    const chatMessages = [
      { role: 'system', content: state.config.systemPrompt },
      { role: 'system', content: `当前图像生成 API 格式为: ${formatDesc}。请使用对应格式的参数。${hasImages ? '本次用户上传了参考图片，是图生图请求。' : ''}` },
      ...state.chatHistory,
    ];

    const chatResponse = await callChatModel(chatMessages);
    const parsed = parseChatResponse(chatResponse);

    updateStep(stepsEl, 0, 'done', '提示词增强完成');

    // 显示分析、增强提示词、参数
    renderAnalysis(assistantEl, parsed.analysis);
    renderEnhancedPrompt(assistantEl, parsed.prompt);
    renderParamTags(assistantEl, parsed.parameters);

    // 步骤 2：调用图像生成模型
    currentStep = 1;
    const modeLabel = hasImages ? '图生图' : '文生图';
    updateStep(stepsEl, 1, 'active', `正在${modeLabel}生成图片（${parsed.parameters?.size || parsed.parameters?.aspectRatio || '1024x1024'}）...`);

    // 准备图片输入数据（Data URI Base64 或 URL）
    if (hasImages) {
      imageInputs = attachments.map(a => a.dataUrl);
    }

    const imageResult = await callImageModel(parsed.prompt, parsed.parameters || {}, imageInputs);

    updateStep(stepsEl, 1, 'done', '图片生成完成');

    // 显示图片
    renderImage(assistantEl, imageResult, parsed.prompt);

    // 保存到历史
    const assistantContent = JSON.stringify({
      analysis: parsed.analysis,
      prompt: parsed.prompt,
      parameters: parsed.parameters,
      imageGenerated: true,
      mode: hasImages ? 'img2img' : 'txt2img',
    });
    state.messages.push({
      role: 'assistant',
      content: assistantContent,
      type: 'image',
      data: { ...parsed, image: imageResult },
    });
    state.chatHistory.push({ role: 'assistant', content: assistantContent });

    // 隐藏处理步骤
    setTimeout(() => {
      stepsEl.style.display = 'none';
    }, 1000);

  } catch (error) {
    console.error('处理失败:', error);
    updateStep(stepsEl, currentStep, 'error', error.message);

    // 判断失败阶段：currentStep === 0 表示对话模型失败（需重新对话），1 表示生图失败（可仅重试生图）
    const failedAtImageGen = currentStep === 1 && parsed !== undefined;
    renderError(assistantEl, error.message, {
      failedAtImageGen,
      retryData: failedAtImageGen ? { parsed, imageInputs, hasImages } : null,
      assistantEl,
      stepsEl,
    });

    // 仍然保存到历史以便上下文连续
    state.chatHistory.push({
      role: 'assistant',
      content: JSON.stringify({ error: error.message }),
    });
  } finally {
    state.isProcessing = false;
    updateStatusIndicator();
    els.sendBtn.classList.remove('loading');
    updateContextInfo();
    scrollToBottom();
  }
}

// ===== UI 渲染 =====

/**
 * 创建助手消息容器
 */
function createAssistantMessage() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">🎨</div>
      <span class="message-role">AI 助手</span>
      <span class="message-time">${formatTime(new Date())}</span>
    </div>
    <div class="message-content">
      <div class="processing-steps">
        <div class="step-item" data-step="0">
          <span class="step-icon"><div class="step-spinner"></div></span>
          <span class="step-text">等待中...</span>
        </div>
        <div class="step-item" data-step="1">
          <span class="step-icon"><div class="step-spinner"></div></span>
          <span class="step-text">等待中...</span>
        </div>
      </div>
      <div class="assistant-body"></div>
    </div>
  `;
  els.messages.appendChild(div);
  scrollToBottom();
  return div;
}

/**
 * 更新处理步骤状态
 */
function updateStep(stepsEl, stepIndex, status, text) {
  const step = stepsEl.querySelector(`[data-step="${stepIndex}"]`);
  if (!step) return;

  step.className = `step-item ${status}`;
  const iconEl = step.querySelector('.step-icon');
  const textEl = step.querySelector('.step-text');

  if (status === 'active') {
    iconEl.innerHTML = '<div class="step-spinner"></div>';
  } else if (status === 'done') {
    iconEl.innerHTML = '✓';
  } else if (status === 'error') {
    iconEl.innerHTML = '✕';
  }
  textEl.textContent = text;

  // 激活下一步的 spinner
  const nextStep = stepsEl.querySelector(`[data-step="${stepIndex + 1}"]`);
  if (nextStep && status === 'done') {
    nextStep.querySelector('.step-icon').innerHTML = '<div class="step-spinner"></div>';
  }
}

/**
 * 渲染分析卡片
 */
function renderAnalysis(assistantEl, analysis) {
  const body = assistantEl.querySelector('.assistant-body');
  const card = document.createElement('div');
  card.className = 'analysis-card';
  card.innerHTML = `
    <div class="analysis-header">
      <div class="analysis-header-left">
        <span>💭</span>
        <span>需求分析</span>
      </div>
      <span class="analysis-toggle">▼</span>
    </div>
    <div class="analysis-body">${escapeHtml(analysis)}</div>
  `;
  card.querySelector('.analysis-header').addEventListener('click', () => {
    card.classList.toggle('collapsed');
  });
  body.appendChild(card);
}

/**
 * 渲染增强提示词卡片
 */
function renderEnhancedPrompt(assistantEl, prompt) {
  const body = assistantEl.querySelector('.assistant-body');
  const card = document.createElement('div');
  card.className = 'prompt-card';
  card.innerHTML = `
    <div class="prompt-header">
      <div class="prompt-header-left">
        <span>✨</span>
        <span>增强提示词</span>
      </div>
      <button class="prompt-copy-btn">复制</button>
    </div>
    <div class="prompt-body">${escapeHtml(prompt)}</div>
  `;
  card.querySelector('.prompt-copy-btn').addEventListener('click', () => {
    copyToClipboard(prompt);
  });
  body.appendChild(card);
}

/**
 * 渲染参数标签
 */
function renderParamTags(assistantEl, params) {
  if (!params) return;
  const body = assistantEl.querySelector('.assistant-body');
  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'param-tags';

  const tagConfigs = [
    { key: 'aspectRatio', label: '比例', icon: '📐' },
    { key: 'size', label: '尺寸', icon: '📐' },
    { key: 'quality', label: '质量', icon: '💎' },
    { key: 'style', label: '风格', icon: '🎭' },
  ];

  tagConfigs.forEach(({ key, label, icon }) => {
    if (params[key]) {
      const tag = document.createElement('span');
      tag.className = 'param-tag';
      tag.innerHTML = `${icon} <span class="param-label">${label}:</span> <span class="param-value">${escapeHtml(params[key])}</span>`;
      tagsDiv.appendChild(tag);
    }
  });

  if (tagsDiv.children.length > 0) {
    body.appendChild(tagsDiv);
  }
}

/**
 * 渲染图片结果
 */
function renderImage(assistantEl, imageResult, prompt) {
  const body = assistantEl.querySelector('.assistant-body');
  const wrapper = document.createElement('div');
  wrapper.className = 'image-result';

  const imgContainer = document.createElement('div');
  imgContainer.className = 'image-wrapper';

  const img = document.createElement('img');
  img.src = imageResult.dataUrl;
  img.alt = prompt;
  img.loading = 'lazy';

  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';

  const zoomBtn = document.createElement('button');
  zoomBtn.className = 'image-action-btn';
  zoomBtn.innerHTML = '🔍 放大查看';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'image-action-btn';
  downloadBtn.innerHTML = '⬇️ 下载';

  // 事件绑定
  imgContainer.addEventListener('click', () => openImageModal(imageResult, prompt));
  zoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageModal(imageResult, prompt);
  });
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadImage(imageResult.dataUrl, `ai-image-${Date.now()}.png`);
  });

  overlay.appendChild(zoomBtn);
  overlay.appendChild(downloadBtn);
  imgContainer.appendChild(img);
  imgContainer.appendChild(overlay);
  wrapper.appendChild(imgContainer);

  // 引用此图片按钮（用于下一轮图生图）
  const refBtn = document.createElement('button');
  refBtn.className = 'image-ref-btn';
  refBtn.innerHTML = '📎 引用此图片';
  refBtn.addEventListener('click', () => {
    addAttachment(imageResult.dataUrl, '引用图片', true);
    els.userInput.focus();
    showToast('已添加引用图片，输入修改需求后发送即可图生图', 'success', 3000);
  });
  wrapper.appendChild(refBtn);

  body.appendChild(wrapper);

  scrollToBottom();
}

/**
 * 渲染错误消息
 */
function renderError(assistantEl, errorMsg, retryCtx) {
  const body = assistantEl.querySelector('.assistant-body');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';

  let retryHtml = '';
  if (retryCtx && retryCtx.failedAtImageGen && retryCtx.retryData) {
    // 生图失败：提供"重试生图"和"重新对话"两个选项
    retryHtml = `
      <div class="error-actions">
        <button class="retry-btn retry-image-btn">🔄 重试生图</button>
        <button class="retry-btn retry-chat-btn">💬 重新对话</button>
      </div>
    `;
  } else {
    // 对话模型失败或早期失败：提供"重新对话"
    retryHtml = `
      <div class="error-actions">
        <button class="retry-btn retry-chat-btn">🔄 重新对话</button>
      </div>
    `;
  }

  errorDiv.innerHTML = `<strong>❌ 处理失败</strong>${escapeHtml(errorMsg)}${retryHtml}`;
  body.appendChild(errorDiv);

  // 绑定重试按钮事件
  if (retryCtx) {
    const retryImageBtn = errorDiv.querySelector('.retry-image-btn');
    const retryChatBtn = errorDiv.querySelector('.retry-chat-btn');

    if (retryImageBtn && retryCtx.retryData) {
      retryImageBtn.addEventListener('click', () => {
        retryImageGeneration(retryCtx, errorDiv);
      });
    }

    if (retryChatBtn) {
      retryChatBtn.addEventListener('click', () => {
        retryFullConversation(retryCtx, errorDiv);
      });
    }
  }
}

/**
 * 仅重试图片生成（复用已增强的提示词，跳过对话模型）
 */
async function retryImageGeneration(retryCtx, errorDiv) {
  const { retryData, assistantEl, stepsEl } = retryCtx;
  const { parsed, imageInputs, hasImages } = retryData;

  if (state.isProcessing) {
    showToast('正在处理中，请稍候', 'warning', 2000);
    return;
  }

  // 移除错误提示
  errorDiv.remove();

  // 恢复处理状态
  state.isProcessing = true;
  updateStatusIndicator();
  els.sendBtn.classList.add('loading');

  // 重置步骤 1 为 active
  const modeLabel = hasImages ? '图生图' : '文生图';
  updateStep(stepsEl, 1, 'active', `正在重试${modeLabel}生成图片（${parsed.parameters?.size || parsed.parameters?.aspectRatio || '1024x1024'}）...`);

  try {
    const imageResult = await callImageModel(parsed.prompt, parsed.parameters || {}, imageInputs);

    updateStep(stepsEl, 1, 'done', '图片生成完成');

    // 显示图片
    renderImage(assistantEl, imageResult, parsed.prompt);

    // 保存到历史
    const assistantContent = JSON.stringify({
      analysis: parsed.analysis,
      prompt: parsed.prompt,
      parameters: parsed.parameters,
      imageGenerated: true,
      mode: hasImages ? 'img2img' : 'txt2img',
    });
    state.messages.push({
      role: 'assistant',
      content: assistantContent,
      type: 'image',
      data: { ...parsed, image: imageResult },
    });
    state.chatHistory.push({ role: 'assistant', content: assistantContent });

    // 隐藏处理步骤
    setTimeout(() => {
      stepsEl.style.display = 'none';
    }, 1000);

  } catch (error) {
    console.error('重试生图失败:', error);
    updateStep(stepsEl, 1, 'error', error.message);
    renderError(assistantEl, error.message, {
      failedAtImageGen: true,
      retryData: { parsed, imageInputs, hasImages },
      assistantEl,
      stepsEl,
    });

    state.chatHistory.push({
      role: 'assistant',
      content: JSON.stringify({ error: error.message }),
    });
  } finally {
    state.isProcessing = false;
    updateStatusIndicator();
    els.sendBtn.classList.remove('loading');
    updateContextInfo();
    scrollToBottom();
  }
}

/**
 * 重新对话：从最近一次用户消息重新开始整个流程
 */
async function retryFullConversation(retryCtx, errorDiv) {
  const { assistantEl, stepsEl } = retryCtx;

  if (state.isProcessing) {
    showToast('正在处理中，请稍候', 'warning', 2000);
    return;
  }

  // 找到最近一条用户消息
  const lastUserMsg = state.chatHistory.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    showToast('未找到可重试的对话', 'warning', 2000);
    return;
  }

  // 从 chatHistory 中移除最后一条用户消息和失败的助手消息
  // 安全移除：如果最后一条是 assistant error，先移除它
  if (state.chatHistory.length > 0 && state.chatHistory[state.chatHistory.length - 1].role === 'assistant') {
    state.chatHistory.pop();
  }
  // 移除最后的 user 消息
  if (state.chatHistory.length > 0 && state.chatHistory[state.chatHistory.length - 1].role === 'user') {
    state.chatHistory.pop();
  }

  // 从 state.messages 中也移除（安全移除）
  if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant') {
    state.messages.pop();
  }
  if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'user') {
    state.messages.pop();
  }

  // 移除 UI 中的当前助手消息和上一条用户消息
  assistantEl.remove();
  const allMessages = els.messages.querySelectorAll('.message.user');
  if (allMessages.length > 0) {
    allMessages[allMessages.length - 1].remove();
  }

  // 从 chatHistory 提取原始用户文本（去掉图片说明后缀）
  let userText = lastUserMsg.content;
  const imgSuffixMatch = userText.match(/\n\n\[本次请求包含.*\]$/);
  if (imgSuffixMatch) {
    userText = userText.replace(imgSuffixMatch[0], '');
  }

  // 重新发送（附件的 dataUrl 已丢失，仅重试文本部分）
  sendMessage(userText);
}

/**
 * 添加消息到 UI
 */
function addMessageToUI(role, content, attachments) {
  const welcome = $('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'user' ? '👤' : '🎨';
  const roleName = role === 'user' ? '你' : 'AI 助手';

  div.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">${avatar}</div>
      <span class="message-role">${roleName}</span>
      <span class="message-time">${formatTime(new Date())}</span>
    </div>
    <div class="message-content">${escapeHtml(content)}</div>
  `;

  // 如果有附件，添加缩略图预览
  if (attachments && attachments.length > 0) {
    const thumbRow = document.createElement('div');
    thumbRow.className = 'attachment-preview';
    thumbRow.style.margin = '8px 0 0';
    attachments.forEach(att => {
      const thumb = document.createElement('div');
      thumb.className = 'attachment-thumb' + (att.isRef ? ' ref-thumb' : '');
      thumb.innerHTML = `<img src="${att.dataUrl}" alt="${escapeHtml(att.name)}">`;
      thumbRow.appendChild(thumb);
    });
    div.querySelector('.message-content').appendChild(thumbRow);
  }

  els.messages.appendChild(div);
  scrollToBottom();
  return div;
}

// ===== 工具函数 =====

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  setTimeout(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  }, 50);
}

function autoResizeTextarea() {
  const ta = els.userInput;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

function updateContextInfo() {
  const rounds = Math.floor(state.chatHistory.length / 2);
  if (rounds > 0) {
    els.contextInfo.textContent = `已对话 ${rounds} 轮`;
  } else {
    els.contextInfo.textContent = '';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success', 2000);
  }).catch(() => {
    showToast('复制失败', 'error', 2000);
  });
}

function downloadImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('图片下载中...', 'success', 2000);
}

function openImageModal(imageResult, prompt) {
  state.currentImage = imageResult;
  els.modalImage.src = imageResult.dataUrl;
  els.modalPrompt.textContent = prompt;
  els.imageModal.classList.add('active');
}

function closeImageModal() {
  els.imageModal.classList.remove('active');
  state.currentImage = null;
}

// ===== 附件管理 =====

/**
 * 添加附件（图片）
 * @param {string} dataUrl - 图片的 Data URL
 * @param {string} name - 附件名称
 * @param {boolean} isRef - 是否是引用的生成结果
 */
function addAttachment(dataUrl, name, isRef = false) {
  state.pendingAttachments.push({ dataUrl, name, isRef });
  renderAttachmentPreview();
}

/**
 * 移除附件
 */
function removeAttachment(index) {
  state.pendingAttachments.splice(index, 1);
  renderAttachmentPreview();
}

/**
 * 渲染附件预览区
 */
function renderAttachmentPreview() {
  const container = els.attachmentPreview;
  container.innerHTML = '';

  if (state.pendingAttachments.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  state.pendingAttachments.forEach((att, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'attachment-thumb' + (att.isRef ? ' ref-thumb' : '');
    thumb.innerHTML = `
      <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}">
      <button class="remove-btn" data-index="${index}">✕</button>
    `;
    thumb.querySelector('.remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeAttachment(index);
    });
    container.appendChild(thumb);
  });
}

/**
 * 处理文件选择
 */
function handleFileSelect(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('请选择图片文件', 'warning', 2000);
    return;
  }

  let loaded = 0;
  imageFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addAttachment(e.target.result, file.name, false);
      loaded++;
      if (loaded === imageFiles.length) {
        showToast(`已添加 ${imageFiles.length} 张图片`, 'success', 2000);
      }
    };
    reader.onerror = () => {
      showToast(`加载图片失败: ${file.name}`, 'error', 2000);
    };
    reader.readAsDataURL(file);
  });
}

// ===== 事件绑定 =====

function bindEvents() {
  // 侧边栏
  els.toggleSidebar.addEventListener('click', () => {
    els.sidebar.classList.toggle('collapsed');
    if (window.innerWidth <= 768) {
      els.sidebar.classList.toggle('show');
      els.sidebarOverlay.classList.toggle('active');
    }
  });

  els.closeSidebar.addEventListener('click', () => {
    els.sidebar.classList.add('collapsed');
    els.sidebar.classList.remove('show');
    els.sidebarOverlay.classList.remove('active');
  });

  els.sidebarOverlay.addEventListener('click', () => {
    els.sidebar.classList.remove('show');
    els.sidebarOverlay.classList.remove('active');
  });

  // 服务商切换
  els.chatProvider.addEventListener('change', () => {
    applyChatProvider();
    // 切换服务商时，如果当前模型不在新列表中，选第一个
    const provider = PROVIDERS[els.chatProvider.value];
    if (provider.chat.models.length > 0 && !provider.chat.models.includes(state.config.chatModel)) {
      els.chatModel.value = provider.chat.models[0];
    } else if (state.config.chatModel) {
      setModelSelection(els.chatModel, state.config.chatModel, els.chatModelCustom);
    }
  });

  els.imageProvider.addEventListener('change', () => {
    applyImageProvider();
    // 切换服务商时，如果当前模型不在新列表中，选第一个
    const provider = PROVIDERS[els.imageProvider.value];
    if (provider.image.models.length > 0 && !provider.image.models.includes(state.config.imageModel)) {
      els.imageModel.value = provider.image.models[0];
    } else if (state.config.imageModel) {
      setModelSelection(els.imageModel, state.config.imageModel, els.imageModelCustom);
    }
  });

  // 模型下拉/自定义输入切换
  setupModelCombo(els.chatModel, els.chatModelCustom, els.chatModelHint);
  setupModelCombo(els.imageModel, els.imageModelCustom, els.imageModelHint);

  // Temperature 滑块
  els.chatTemperature.addEventListener('input', () => {
    els.chatTemperatureVal.textContent = els.chatTemperature.value;
  });

  // 保存配置
  els.saveConfig.addEventListener('click', saveConfig);

  // 恢复默认提示词
  els.resetPrompt.addEventListener('click', () => {
    els.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
    showToast('已恢复默认系统提示词', 'info', 2000);
  });

  // 导出配置
  els.exportConfig.addEventListener('click', () => {
    const config = { ...state.config };
    config.chatApiKey = config.chatApiKey ? '***' : '';
    config.imageApiKey = config.imageApiKey ? '***' : '';
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadImage(url, 'ai-image-config.json');
    URL.revokeObjectURL(url);
    showToast('配置已导出（API Key 已隐藏）', 'success', 2000);
  });

  // 导出对话
  els.exportChat.addEventListener('click', () => {
    if (state.messages.length === 0) {
      showToast('暂无对话记录', 'warning', 2000);
      return;
    }
    const exportData = state.messages.map(m => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content, time: formatTime(new Date()) };
      } else if (m.data) {
        return {
          role: 'assistant',
          analysis: m.data.analysis,
          prompt: m.data.prompt,
          parameters: m.data.parameters,
          hasImage: true,
        };
      }
      return { role: 'assistant', content: m.content };
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadImage(url, `ai-chat-${Date.now()}.json`);
    URL.revokeObjectURL(url);
    showToast('对话已导出', 'success', 2000);
  });

  // 清空对话
  els.clearChat.addEventListener('click', () => {
    if (state.messages.length === 0) {
      showToast('暂无对话记录', 'info', 2000);
      return;
    }
    if (confirm('确定要清空所有对话记录吗？')) {
      state.messages = [];
      state.chatHistory = [];
      els.messages.innerHTML = '';
      // 恢复欢迎屏
      els.messages.innerHTML = `
        <div id="welcome-screen" class="welcome-screen">
          <div class="welcome-icon">🎨</div>
          <h2>AI 生图助手</h2>
          <p>模拟 ChatGPT 生图流程：提示词理解 → 上下文整合 → 多轮修正 → 参数选择 → 图片生成</p>
          <div class="welcome-features">
            <div class="feature-card" data-prompt="画一只在月光下漫步的猫，赛博朋克风格">
              <div class="feature-icon">🐱</div>
              <div class="feature-text">动物插画</div>
              <div class="feature-hint">画一只在月光下漫步的猫</div>
            </div>
            <div class="feature-card" data-prompt="一个未来城市的天际线，日落时分，赛博朋克风格">
              <div class="feature-icon">🌆</div>
              <div class="feature-text">风景场景</div>
              <div class="feature-hint">未来城市天际线</div>
            </div>
            <div class="feature-card" data-prompt="设计一个极简风格的咖啡品牌 logo">
              <div class="feature-icon">☕</div>
              <div class="feature-text">品牌设计</div>
              <div class="feature-hint">咖啡品牌 logo</div>
            </div>
            <div class="feature-card" data-prompt="一幅油画风格的山水风景，有云雾缭绕的山峰">
              <div class="feature-icon">🏔️</div>
              <div class="feature-text">艺术创作</div>
              <div class="feature-hint">油画山水风景</div>
            </div>
          </div>
          <div class="welcome-tip">
            💡 点击左侧 <strong>☰</strong> 按钮配置 API 参数后即可开始使用
          </div>
        </div>
      `;
      bindFeatureCards();
      updateContextInfo();
      showToast('对话已清空', 'success', 2000);
    }
  });

  // 输入框
  els.userInput.addEventListener('input', autoResizeTextarea);
  els.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!els.sendBtn.disabled) {
        sendMessage(els.userInput.value);
      }
    }
  });

  // 附件按钮 - 点击触发文件选择
  els.attachBtn.addEventListener('click', () => {
    els.fileInput.click();
  });

  // 文件选择
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files);
    }
    e.target.value = ''; // 重置以便重复选择同一文件
  });

  // 粘贴图片
  els.userInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          addAttachment(ev.target.result, `粘贴图片-${Date.now()}.png`, false);
          showToast('已添加粘贴的图片', 'success', 2000);
        };
        reader.readAsDataURL(file);
      }
    });
  });

  // 拖拽图片到输入区
  const inputArea = document.getElementById('input-area');
  inputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    inputArea.style.background = 'var(--accent-light)';
  });
  inputArea.addEventListener('dragleave', () => {
    inputArea.style.background = '';
  });
  inputArea.addEventListener('drop', (e) => {
    e.preventDefault();
    inputArea.style.background = '';
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  });

  // 发送按钮
  els.sendBtn.addEventListener('click', () => {
    sendMessage(els.userInput.value);
  });

  // 弹窗关闭
  els.imageModal.addEventListener('click', (e) => {
    if (e.target === els.imageModal) closeImageModal();
  });

  els.modalDownload.addEventListener('click', () => {
    if (state.currentImage) {
      downloadImage(state.currentImage.dataUrl, `ai-image-${Date.now()}.png`);
    }
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeImageModal();
    }
  });

  // 特性卡片
  bindFeatureCards();
}

/**
 * 绑定欢迎屏特性卡片点击事件
 */
function bindFeatureCards() {
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      if (prompt) {
        els.userInput.value = prompt;
        autoResizeTextarea();
        els.userInput.focus();
      }
    });
  });
}

// ===== 初始化 =====
function init() {
  loadConfig();
  bindEvents();

  // 桌面端默认展开侧边栏
  if (window.innerWidth > 768) {
    els.sidebar.classList.remove('collapsed');
  } else {
    els.sidebar.classList.add('collapsed');
  }

  // 如果没有配置 API Key，自动展开侧边栏
  if (!state.config.chatApiKey) {
    els.sidebar.classList.remove('collapsed');
    if (window.innerWidth <= 768) {
      els.sidebar.classList.add('show');
      els.sidebarOverlay.classList.add('active');
    }
  }

  console.log('🎨 AI 生图助手已启动');
}

// 启动
document.addEventListener('DOMContentLoaded', init);
