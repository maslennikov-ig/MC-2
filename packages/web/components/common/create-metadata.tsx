"use client"

import { useEffect } from "react"

export default function CreateMetadata() {
  useEffect(() => {
    // Set page title and meta description
    document.title = "Создать курс | MegaCampusAI"
    
    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute('content', 'Создайте профессиональный образовательный курс за несколько минут. Загрузите документы, выберите стиль изложения и получите готовый курс с видео, аудио и интерактивными тестами.')
    
    // Update keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]')
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta')
      metaKeywords.setAttribute('name', 'keywords')
      document.head.appendChild(metaKeywords)
    }
    metaKeywords.setAttribute('content', 'создать курс, генерация курсов, AI создание курсов, загрузка документов, автоматическое создание, обучающие материалы')
    
    // Add Open Graph tags
    const ogTags = [
      { property: 'og:title', content: 'Создать курс | MegaCampusAI' },
      { property: 'og:description', content: 'Создайте профессиональный образовательный курс за несколько минут с помощью искусственного интеллекта' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: window.location.href },
      { property: 'og:image', content: `${window.location.origin}/images/create-og-image.png` },
      { property: 'og:site_name', content: 'MegaCampusAI' },
    ]
    
    ogTags.forEach(tag => {
      let meta = document.querySelector(`meta[property="${tag.property}"]`)
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('property', tag.property)
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', tag.content)
    })
    
    // Add Twitter Card tags
    const twitterTags = [
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Создать курс | MegaCampusAI' },
      { name: 'twitter:description', content: 'Создайте профессиональный образовательный курс за несколько минут с помощью AI' },
      { name: 'twitter:image', content: `${window.location.origin}/images/create-twitter-image.png` },
    ]
    
    twitterTags.forEach(tag => {
      let meta = document.querySelector(`meta[name="${tag.name}"]`)
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', tag.name)
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', tag.content)
    })
    
    // Add JSON-LD structured data for course creation
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Создать курс",
      "description": "Форма создания образовательного курса с помощью искусственного интеллекта",
      "url": window.location.href,
      "isPartOf": {
        "@type": "WebSite",
        "name": "MegaCampusAI",
        "url": window.location.origin
      },
      "primaryImageOfPage": {
        "@type": "ImageObject",
        "url": `${window.location.origin}/images/create-course-preview.png`
      },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Главная",
            "item": window.location.origin
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Создать курс",
            "item": window.location.href
          }
        ]
      }
    }
    
    let jsonLdScript = document.querySelector('script[type="application/ld+json"][data-page="create"]')
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script')
      jsonLdScript.setAttribute('type', 'application/ld+json')
      jsonLdScript.setAttribute('data-page', 'create')
      document.head.appendChild(jsonLdScript)
    }
    jsonLdScript.textContent = JSON.stringify(structuredData)
    
    // Add canonical URL
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', `${window.location.origin}/create`)
    
  }, [])
  
  return null
}