<template>
  <div class="editor-box" :class="showLoading ? 'editor-box-loading' : ''">
    <loading class="loading" v-if="showLoading"/>
    <textarea v-else style="outline: none" :id="editorId" ref="editorRef"></textarea>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef, defineEmits, computed} from 'vue';
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'

defineExpose({
  clearEditor,
  focus,
  getContent,
  setContent,
  execCommand
})

const props = defineProps({
  defValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: () => `editor-${Date.now()}`
  }
});


const {locale} = useI18n()
const emit = defineEmits(['change','focus']);
const editor = shallowRef(null);
const isInitialized = ref(false);
const editorRef = ref(null);
const showLoading = ref(false);
const uiStore = useUiStore();
const settingStore = useSettingStore();

onMounted(() => {
  initTinyMCE();
});

onBeforeUnmount(() => {
  destroyEditor();
});

watch(() => props.defValue, (newValue) => {
  if (editor.value && editor.value.getContent() !== newValue) {
    editor.value.setContent(newValue);
  }
});

watch(() => [uiStore.dark, settingStore.lang], () => {
  destroyEditor();
  initEditor();
});

const language = computed(() => {
  if (locale.value === 'zh') {
    return 'zh_CN'
  }

  return 'en'
})

function clearEditor() {
  if (editor.value) {
    editor.value.setContent('');
  }
}

function initTinyMCE() {
  if (window.tinymce) {
    initEditor();
  } else {
    showLoading.value = true;
    const script = document.createElement('script');
    script.src = '/tinymce/tinymce.min.js';
    script.onload = () => initEditor();
    document.head.appendChild(script);
    showLoading.value = false;
  }
}

function initEditor() {
  window.tinymce.init({
    selector: `#${props.editorId}`,
    statusbar: false,
    height: "100%",
    auto_focus: true,
    //relative_urls: false,  //阻止 img标签域名和网站域名相同 自动把链接转换相对路径
    //remove_script_host: false, // 阻止删除 URL 中的域名
    forced_root_block: 'div',
    skin: `${uiStore.dark ? 'oxide-dark' : 'oxide'}`,
    content_css: `/tinymce/css/index.css,${uiStore.dark ? 'dark' : 'default'}`,
    content_style: `:root {
         --scrollbar-track-color: ${uiStore.dark ? '#141414' : '#FFFFFF'};
         --scrollbar-thumb-color: ${uiStore.dark ? '#8D9095' : '#A8ABB2'};
    }`,
    plugins: 'link image advlist lists emoticons fullscreen table preview code',
    toolbar: 'undo redo | blocks fontsize | bold italic underline strikethrough forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | blockquote hr link image table emoticons | removeformat code',
    toolbar_mode: 'scrolling',
    font_size_formats: '8px 10px 12px 14px 16px 18px 24px 36px',
    emoticons_search: false,
    schema: 'html5',
    extended_valid_elements: 'svg[*],defs[*],linearGradient[*],radialGradient[*],stop[*],path[*],rect[*],circle[*],g[*],line[*],polygon[*],polyline[*],text[*],tspan[*],use[*],symbol[*],marker[*],pattern[*],clipPath[*],mask[*],filter[*],feGaussianBlur[*],feColorMatrix[*],feBlend[*],feMerge[*],feMergeNode[*],+div[*],+span[*],+p[*],+a[*],+style[*]',
    custom_elements: 'svg,defs,linearGradient,radialGradient,stop,path,rect,circle,g,line,polygon,polyline,text,tspan,use,symbol,marker,pattern,clipPath,mask,filter,feGaussianBlur,feColorMatrix,feBlend,feMerge,feMergeNode',
    valid_children: '+body[style],+div[svg|defs|linearGradient|path|rect|circle|g|line|polygon|polyline|text|tspan|use|symbol|style],+p[svg|span|a|code|strong|em],+span[svg|span|a|code|strong|em],+a[div|span|svg|img|p]',
    language: language.value,
    language_load: true,
    menubar: false,
    license_key: 'gpl',
    noneditable_class: 'mceNonEditable',
    setup: (ed) => {
      editor.value = ed;
      ed.on('init', () => {
        ed.setContent(props.defValue);
        isInitialized.value = true;
      });
      ed.on('input change', () => {
        const content = ed.getContent();
        const text = ed.getContent({format: 'text'});
        emit('change', content, text);
      });
      ed.on('focus', () => {
        emit('focus', focus);
      })
    },
    autofocus: true,
    branding: false,
    file_picker_types: 'image',
    image_dimensions: false,
    image_description: false,
    link_title: false,
    dialog_type: 'none',
    file_picker_callback: (callback, value, meta) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');

      input.addEventListener('change', async (e) => {
        let file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          const id = 'blobid' + (new Date()).getTime();
          const blobCache = tinymce.activeEditor.editorUpload.blobCache;
          const base64 = reader.result.split(',')[1];
          const blobInfo = blobCache.create(id, file, base64);
          blobCache.add(blobInfo);

          callback(blobInfo.blobUri(), {title: file.name});
        }
        reader.readAsDataURL(file);
      });

      input.click();
    }
  });
}

function focus() {
  nextTick(() => {
    editor.value.focus()
  })
}

function getContent() {
  return editor.value ? editor.value.getContent() : ''
}

function setContent(content) {
  if (editor.value) {
    editor.value.setContent(content || '');
  }
}

function execCommand(cmd, value = null) {
  if (editor.value) {
    editor.value.execCommand(cmd, false, value);
  }
}


function destroyEditor() {
  if (editor.value) {
    editor.value.destroy();
    editor.value = null;
  }
}
</script>

<style lang="scss" scoped>
.editor-box {
  height: 100%;
  width: 100%;
}

.loading {
  margin: auto;
}

.editor-box-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.tox-editor-header) {
  background: var(--el-bg-color-overlay) !important;
  border-bottom: 1px solid var(--el-border-color-lighter) !important;
  padding: 0 !important;
  margin: 0 !important;
}

:deep(.tox-toolbar), :deep(.tox-toolbar__primary) {
  background: var(--el-bg-color-overlay) !important;
  padding: 4px 6px !important;
  gap: 2px !important;
  display: flex !important;
  align-items: center !important;
}

:deep(.tox-toolbar__group) {
  display: inline-flex !important;
  align-items: center !important;
  gap: 2px !important;
  padding: 0 2px !important;
  margin: 0 !important;
  border: none !important;
}

:deep(.tox-tbtn) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 1px solid transparent !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: var(--el-text-color-regular) !important;
  box-sizing: border-box !important;
  line-height: 1 !important;
  cursor: pointer !important;
  overflow: hidden !important;
  transition: all 0.15s ease !important;

  .tox-icon,
  .tox-tbtn__icon-custom,
  span {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    line-height: 1 !important;
  }

  svg {
    display: block !important;
    width: 15px !important;
    height: 15px !important;
    max-width: 15px !important;
    max-height: 15px !important;
    margin: 0 auto !important;
    padding: 0 !important;
    flex-shrink: 0 !important;
    vertical-align: middle !important;
    fill: currentColor !important;
  }

  &:hover {
    background: var(--el-fill-color) !important;
    color: var(--el-color-primary) !important;
  }

  &.tox-tbtn--enabled, &[aria-pressed="true"] {
    background: var(--el-color-primary-light-9, rgba(91, 110, 245, 0.12)) !important;
    color: var(--el-color-primary) !important;
    font-weight: 600 !important;
  }

  &.tox-tbtn--disabled, &[aria-disabled="true"] {
    opacity: 0.35 !important;
    cursor: not-allowed !important;
    background: transparent !important;
  }
}

:deep(.tox-tbtn--select) {
  width: auto !important;
  min-width: 64px !important;
  max-width: 90px !important;
  height: 28px !important;
  padding: 0 6px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 4px !important;

  .tox-tbtn__select-label {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: inherit !important;
    margin: 0 !important;
    padding: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 28px !important;
  }

  .tox-tbtn__select-chevron {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 12px !important;
    height: 12px !important;

    svg {
      width: 10px !important;
      height: 10px !important;
      margin: 0 auto !important;
    }
  }
}

:deep(.tox-split-button) {
  height: 28px !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 6px !important;
  display: inline-flex !important;
  align-items: center !important;
  overflow: hidden !important;

  .tox-tbtn {
    width: 20px !important;
    min-width: 20px !important;
    max-width: 20px !important;
    height: 28px !important;
    border-radius: 6px 0 0 6px !important;
    padding: 0 !important;
    margin: 0 !important;

    svg {
      width: 14px !important;
      height: 14px !important;
    }
  }

  .tox-split-button__chevron {
    width: 12px !important;
    min-width: 12px !important;
    max-width: 12px !important;
    height: 28px !important;
    border-radius: 0 6px 6px 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;

    svg {
      width: 8px !important;
      height: 8px !important;
      margin: 0 auto !important;
    }
  }
}

:deep(.tox-separator) {
  height: 16px !important;
  width: 1px !important;
  margin: 0 4px !important;
  background: var(--el-border-color-lighter) !important;
  border: none !important;
}

:deep(.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke) {
  width: 80px !important;
}

:deep(.tox.tox-tinymce.tox-fullscreen) {
  padding-right: 15px;
  padding-left: 15px;
  padding-bottom: 15px;
  background: var(--el-bg-color);
  @media (max-width: 767px) {
    padding-right: 10px;
    padding-left: 10px;
    padding-bottom: 10px;
  }
}

:deep(.tox-tinymce) {
  border: none;
  border-radius: 0;
}

:deep(.tox .tox-edit-area::before) {
  display: none;
}

</style>
