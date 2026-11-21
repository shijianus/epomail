<template>
  <div class="content-box">
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
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import {useUiStore} from "@/store/ui.js";
import DOMPurify from 'dompurify';
import { OFFICIAL_MAIL_CSS } from '@/utils/official-mail-layout.js';
import { MAIL_SANITIZE_OPTIONS, prepareMailContent } from '@/utils/mail-content-privacy.js';

const uiStore = useUiStore();

const props = defineProps({
  html: {
    type: String,
    required: true
  },
  official: { type: Boolean, default: false },
  messageKey: { type: [String, Number], default: '' },
  trustedImageUrls: { type: Array, default: () => [] }
})

const container = ref(null)
const remoteImageCount = ref(0)
const remoteImagesAllowed = ref(false)
let shadowRoot = null
let layoutObserver
let tables = []
const scrollContainers = new WeakMap()

function allowImages() {
  remoteImagesAllowed.value = true;
  updateContent();
}

function updateContent() {
  if (!shadowRoot) return;

  const prepared = prepareMailContent(props.html, {
    allowRemoteImages: remoteImagesAllowed.value,
    official: props.official,
    trustedImageUrls: props.trustedImageUrls
  });
  remoteImageCount.value = prepared.remoteImageCount;
  const safeBodyStyle = prepared.bodyStyle;
  const invertMail = uiStore.dark && !props.official;
  const cleanedHtml = DOMPurify.sanitize(prepared.html, MAIL_SANITIZE_OPTIONS);

  // Only the application's own style block enters the live shadow root.
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        display: block;
        width: 100%;
        min-width: 0;
        height: auto;
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

      .mail-viewport, .mail-table-scroll {
        max-width: 100%;
        min-width: 0;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
      }

      .shadow-content {
        box-sizing: border-box;
        color: #13181d;
        background: ${uiStore.dark ? '#ffffff' : 'transparent'};
        width: 100%;
        min-width: 0;
        ${invertMail ? 'filter: invert(1) hue-rotate(180deg);' : ''}
        ${safeBodyStyle ? safeBodyStyle : ''} /* 注入经过白名单安全校验的 body style */
      }

      img, video, svg, .epo-trans-img-overlay, .epo-trans-img-mask {
        ${invertMail ? 'filter: invert(1) hue-rotate(180deg);' : ''}
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

      ${props.official ? OFFICIAL_MAIL_CSS : ''}
    </style>
    <div class="mail-viewport">
      <div class="shadow-content${props.official ? ' official-mail-body' : ''}">${cleanedHtml}</div>
    </div>
  `;
  layoutObserver.disconnect();
  tables = props.official ? [] : [...shadowRoot.querySelectorAll('table')].filter(table => !table.parentElement.closest('table'));
  if (tables.length) {
    layoutObserver.observe(container.value);
    for (const table of tables) layoutObserver.observe(table);
    layoutTables();
  }
}

// Keep sender-defined table sizing. Only a table that exceeds its reading
// area gets a scroll container, leaving sibling paragraphs at normal size.
function layoutTables() {
  const hostWidth = container.value?.clientWidth;
  if (!hostWidth) return;
  for (const table of tables) {
    const scroller = scrollContainers.get(table);
    const parent = scroller ? scroller.parentElement : table.parentElement;
    const available = Math.min(hostWidth, parent.clientWidth || hostWidth);
    if (table.getBoundingClientRect().width > available + 1) {
      if (scroller) {
        scroller.style.maxWidth = available + 'px';
        continue;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'mail-table-scroll';
      wrapper.tabIndex = 0;
      wrapper.style.maxWidth = available + 'px';
      table.replaceWith(wrapper);
      wrapper.append(table);
      scrollContainers.set(table, wrapper);
    } else if (scroller) {
      scroller.replaceWith(table);
      scrollContainers.delete(table);
    }
  }
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  layoutObserver = new ResizeObserver(layoutTables)
  updateContent()
})

onBeforeUnmount(() => layoutObserver?.disconnect())

watch(() => [props.html, props.messageKey, props.trustedImageUrls, props.official], ([html, key], [oldHtml, oldKey]) => {
  // Approval belongs only to this message in this view, never to a sender,
  // account or browser. Without an explicit key, new HTML resets it as well.
  if (key !== oldKey || (!key && html !== oldHtml)) remoteImagesAllowed.value = false;
  updateContent()
})

watch(() => uiStore.dark, updateContent)
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
