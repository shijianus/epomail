/**
 * Built-in Theme Wallpaper & Profile Cover Presets
 * Crafted for seamless compatibility with both Dark and Light themes
 */

export const THEME_PRESETS = [
  {
    id: 'none',
    nameZh: '默认纯净',
    nameEn: 'Default Clean',
    descZh: '原生简约纯色底色',
    descEn: 'Clean surface without wallpaper',
    preview: 'var(--bg-surface)',
    url: ''
  },
  {
    id: 'theme-nebula',
    nameZh: '深蓝星芒',
    nameEn: 'Deep Nebula',
    descZh: '典雅深蓝星际渐变',
    descEn: 'Deep indigo cosmic gradient',
    preview: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)',
    url: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)'
  },
  {
    id: 'theme-aurora',
    nameZh: '极光幻影',
    nameEn: 'Emerald Aurora',
    descZh: '静谧高贵的翡翠极光氛围',
    descEn: 'Subtle emerald auroral glow',
    preview: 'linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #022c22 100%)',
    url: 'linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #022c22 100%)'
  },
  {
    id: 'theme-sunset',
    nameZh: '暮光晚霞',
    nameEn: 'Warm Twilight',
    descZh: '柔和深邃的暮色渐变',
    descEn: 'Soft dusk twilight blend',
    preview: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 50%, #701a75 100%)',
    url: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 50%, #701a75 100%)'
  },
  {
    id: 'theme-slate',
    nameZh: '石板灰调',
    nameEn: 'Slate Texture',
    descZh: '专业高级的石板深灰纹理',
    descEn: 'Professional deep slate tone',
    preview: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    url: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
  },
  {
    id: 'theme-ocean',
    nameZh: '碧海蔚蓝',
    nameEn: 'Ocean Deep',
    descZh: '沉静辽阔的深海蓝渐变',
    descEn: 'Serene deep oceanic gradient',
    preview: 'linear-gradient(135deg, #0c4a6e 0%, #082f49 50%, #0f172a 100%)',
    url: 'linear-gradient(135deg, #0c4a6e 0%, #082f49 50%, #0f172a 100%)'
  },
  {
    id: 'theme-cyber',
    nameZh: '赛博数码',
    nameEn: 'Cyber Grid',
    descZh: '科技感网格与微光纹理',
    descEn: 'High-tech minimal grid ambiance',
    preview: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)',
    url: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)'
  },
  {
    id: 'theme-mountain',
    nameZh: '雪峰晨雾',
    nameEn: 'Misty Alpine',
    descZh: '高质感静谧雪峰壁纸',
    descEn: 'Serene mountain landscape wallpaper',
    preview: 'linear-gradient(135deg, #1e293b, #334155)',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80'
  },
  {
    id: 'theme-prism',
    nameZh: '绚丽光晕',
    nameEn: 'Prism Glow',
    descZh: '柔和高雅的多彩弥散光晕',
    descEn: 'Vibrant diffuse prism glow',
    preview: 'linear-gradient(135deg, #312e81 0%, #4338ca 35%, #0369a1 70%, #0f172a 100%)',
    url: 'linear-gradient(135deg, #312e81 0%, #4338ca 35%, #0369a1 70%, #0f172a 100%)'
  }
]

export const COVER_PRESETS = [
  {
    id: 'cover-default',
    nameZh: '默认极光',
    nameEn: 'Default Aurora',
    preview: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #047857 100%)',
    url: ''
  },
  {
    id: 'cover-cyber',
    nameZh: '赛博霓虹',
    nameEn: 'Cyber Neon',
    preview: 'linear-gradient(135deg, #0f172a 0%, #3b0764 50%, #1e1b4b 100%)',
    url: 'linear-gradient(135deg, #0f172a 0%, #3b0764 50%, #1e1b4b 100%)'
  },
  {
    id: 'cover-sunset',
    nameZh: '暮光晚霞',
    nameEn: 'Dusk Sunset',
    preview: 'linear-gradient(135deg, #4c1d95 0%, #831843 50%, #c2410c 100%)',
    url: 'linear-gradient(135deg, #4c1d95 0%, #831843 50%, #c2410c 100%)'
  },
  {
    id: 'cover-emerald',
    nameZh: '翡翠秘境',
    nameEn: 'Emerald Glow',
    preview: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #047857 100%)',
    url: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #047857 100%)'
  },
  {
    id: 'cover-ocean',
    nameZh: '深邃蔚蓝',
    nameEn: 'Deep Ocean',
    preview: 'linear-gradient(135deg, #082f49 0%, #0369a1 50%, #0284c7 100%)',
    url: 'linear-gradient(135deg, #082f49 0%, #0369a1 50%, #0284c7 100%)'
  },
  {
    id: 'cover-mountain',
    nameZh: '高山雪峰',
    nameEn: 'Alpine Peak',
    preview: 'linear-gradient(135deg, #1e293b, #475569)',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80'
  }
]

export function getWallpaperCssById(idOrUrl) {
  if (!idOrUrl || idOrUrl === 'none') return ''
  const preset = THEME_PRESETS.find(p => p.id === idOrUrl)
  const val = preset ? preset.url : idOrUrl
  if (!val) return ''
  if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/')) {
    return `url('${val}')`
  }
  return val
}
