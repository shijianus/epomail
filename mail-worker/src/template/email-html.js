import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls.js';

export default function emailHtmlTemplate(html, domain) {

	const { document } = parseHTML(html);
	document.querySelectorAll('script, iframe, object, embed, form, base, applet').forEach(el => el.remove());
	document.querySelectorAll('*').forEach(el => {
		for (const attr of Array.from(el.attributes || [])) {
			if (attr.name.toLowerCase().startsWith('on') || (attr.value && attr.value.toLowerCase().includes('javascript:'))) {
				el.removeAttribute(attr.name);
			}
		}
	});
	const bodyEl = document.querySelector('body');
	if (bodyEl && bodyEl.hasAttribute('style')) {
		const rawStyle = bodyEl.getAttribute('style') || '';
		if (/[<>{}\\]|expression|url\s*\(|@import|javascript:/i.test(rawStyle) || !/^[a-zA-Z0-9\s:;._#%,'"-]+$/.test(rawStyle)) {
			bodyEl.removeAttribute('style');
		}
	}
	html = document.toString();

	html = html.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none';">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .content-box {
        		padding: 15px 10px;
            width: 100%;
            height: 100%;
            overflow: auto; /* 改为 auto 允许滚动 */
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div id='container' class='content-html'></div>
    </div>

    <script>

        function renderHTML(html) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            // 提取 <body> 的 style 属性并严格清洗，防御 CSS/HTML 逃逸与 XSS
            const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
            const bodyStyleMatch = html.match(bodyStyleRegex);
            let bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';
            if (/[<>{}\\\\]|expression|url\\s*\\(|@import|javascript:/i.test(bodyStyle) || !/^[a-zA-Z0-9\\s:;._#%,'"-]+$/.test(bodyStyle)) {
                bodyStyle = '';
            }

            // 移除 <body> 标签
            const cleanedHtml = html.replace(/<\\/?body[^>]*>/gi, '');


            // 渲染内容
            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont,
                                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto; /* 添加滚动 */
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
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            // 自动缩放
            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {

            if (!shadowRoot || !container) return;

            const parent = container;
            const shadowContent = shadowRoot.querySelector('.shadow-content');

            if (!shadowContent) return;

            const parentWidth = parent.offsetWidth;
            const childWidth = shadowContent.scrollWidth;

            if (childWidth === 0) return;

            const scale = parentWidth / childWidth;

            const hostElement = shadowRoot.host;
            hostElement.style.zoom = scale;
        }

        // 使用示例
        const exampleHtml = ${safeHtmlJson};

        // 渲染HTML
        renderHTML(exampleHtml);
    </script>
</body>
</html>`
}
