<template>
  <div class="content-box" ref="contentBox">
    <div v-if="remoteImageCount" class="remote-images-notice" role="status">
      <svg class="privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>
      <span v-if="remoteImagesAllowed">{{ $t('privacySettings.remoteAllowed') }}</span>
      <span v-else>{{ $t('privacySettings.remoteBlocked') }}</span>
      <button v-if="!remoteImagesAllowed" type="button" class="remote-images-button" @click="allowImages">
        {{ $t('privacySettings.allowImages') }}
      </button>
    </div>
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import {useUiStore} from "@/store/ui.js";
import DOMPurify from 'dompurify';
import { MAIL_SANITIZE_OPTIONS, prepareMailContent } from '@/utils/mail-content-privacy.js';

const uiStore = useUiStore();

const props = defineProps({
  html: {
    type: String,
    required: true
  },
  messageKey: { type: [String, Number], default: '' },
  trustedImageUrls: { type: Array, default: () => [] }
})

const container = ref(null)
const contentBox = ref(null)
const remoteImageCount = ref(0)
const remoteImagesAllowed = ref(false)
let shadowRoot = null

function allowImages() {
  remoteImagesAllowed.value = true;
  updateContent();
  autoScale();
}

function updateContent() {
  if (!shadowRoot) return;

  const prepared = prepareMailContent(props.html, {
    allowRemoteImages: remoteImagesAllowed.value,
    trustedImageUrls: props.trustedImageUrls
  });
  remoteImageCount.value = prepared.remoteImageCount;
  const safeBodyStyle = prepared.bodyStyle;
  const cleanedHtml = DOMPurify.sanitize(prepared.html, MAIL_SANITIZE_OPTIONS);

  // Only the application's own style block enters the live shadow root.
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
        ${safeBodyStyle ? safeBodyStyle : ''} /* 注入经过白名单安全校验的 body style */
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

watch(() => [props.html, props.messageKey, props.trustedImageUrls], ([html, key], [oldHtml, oldKey]) => {
  // Approval belongs only to this message in this view, never to a sender,
  // account or browser. Without an explicit key, new HTML resets it as well.
  if (key !== oldKey || (!key && html !== oldHtml)) remoteImagesAllowed.value = false;
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

.remote-images-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.privacy-icon { width: 18px; height: 18px; flex-shrink: 0; color: var(--accent-primary); }
.remote-images-notice > span { flex: 1 1 180px; min-width: 0; overflow-wrap: anywhere; }
.remote-images-button {
  padding: 5px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--accent-primary);
  font: inherit;
  cursor: pointer;
  white-space: normal;
}
.remote-images-button:hover { background: var(--bg-hover); }
.remote-images-button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }

.content-html {
  width: 100%;
  height: 100%;
}
</style>
