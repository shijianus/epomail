<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import {useUiStore} from "@/store/ui.js";
import DOMPurify from 'dompurify';

const uiStore = useUiStore();

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return;

  // 1. 提取 <body> 的 style 属性（如果存在）
  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
  const bodyStyleMatch = (props.html || '').match(bodyStyleRegex);
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

  // 2. 移除 <body> 标签（保留内容）并使用 DOMPurify 进行 XSS 防御清洗
  const rawHtml = (props.html || '').replace(/<\/?body[^>]*>/gi, '');
  const cleanedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form']
  });

  // 3. 将 body 的 style 应用到 .shadow-content
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: -apple-system, 'Outfit', BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: ${uiStore.dark ? '#ffffff' : '#13181D'};
        word-break: break-word;
        color-scheme: ${uiStore.dark ? 'dark' : 'light'};
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: ${uiStore.dark ? '#ffffff' : 'transparent'};
        width: fit-content;
        height: fit-content;
        min-width: 100%;
        ${uiStore.dark ? 'filter: invert(1) hue-rotate(180deg);' : ''}
        ${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
      }

      img, video, svg, .epo-trans-img-overlay, .epo-trans-img-mask {
        ${uiStore.dark ? 'filter: invert(1) hue-rotate(180deg);' : ''}
        max-width: 100%;
      }

      .epo-trans-img-wrap, .epo-trans-img-container {
        position: relative;
        display: inline-block;
        max-width: 100%;
        vertical-align: top;
      }

      .epo-trans-img-mask, .epo-trans-img-overlay {
        cursor: pointer;
        pointer-events: auto;
        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .epo-trans-img-wrap:hover .epo-trans-img-mask,
      .epo-trans-img-container:hover .epo-trans-img-overlay,
      .epo-trans-img-mask:hover,
      .epo-trans-img-overlay:hover {
        opacity: 0.08 !important;
      }

    </style>
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})

watch(() => uiStore.dark, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, 'Outfit', BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
