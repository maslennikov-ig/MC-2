'use client'

import { useEffect } from 'react'

export default function HomeMetadata() {
  useEffect(() => {
    // Set page title and meta description
    document.title = 'MegaCampusAI - Должностные инструкции и курсы для команды'

    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute(
      'content',
      'Создавайте должностные инструкции под компанию и превращайте их в практические курсы для команды.'
    )

    // Update keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]')
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta')
      metaKeywords.setAttribute('name', 'keywords')
      document.head.appendChild(metaKeywords)
    }
    metaKeywords.setAttribute(
      'content',
      'должностные инструкции, создание курсов, обучение команды, искусственный интеллект, онлайн курсы'
    )

    // Add Open Graph tags
    const ogTags = [
      {
        property: 'og:title',
        content: 'MegaCampusAI - Должностные инструкции и курсы для команды',
      },
      {
        property: 'og:description',
        content:
          'Создавайте должностные инструкции под компанию и превращайте их в практические курсы',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: 'https://courseai.ru/og-image.jpg' },
      { property: 'og:url', content: 'https://ai.megacampus.ru' },
      { property: 'og:site_name', content: 'MegaCampusAI' },
      { property: 'og:locale', content: 'ru_RU' },
    ]

    ogTags.forEach((tag) => {
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
      {
        name: 'twitter:title',
        content: 'MegaCampusAI - Должностные инструкции и курсы для команды',
      },
      {
        name: 'twitter:description',
        content:
          'Создавайте должностные инструкции под компанию и превращайте их в практические курсы',
      },
      { name: 'twitter:image', content: `${window.location.origin}/images/twitter-image.png` },
    ]

    twitterTags.forEach((tag) => {
      let meta = document.querySelector(`meta[name="${tag.name}"]`)
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', tag.name)
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', tag.content)
    })

    // Add JSON-LD structured data
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'MegaCampusAI',
      description:
        'Платформа для создания должностных инструкций и курсов с использованием искусственного интеллекта',
      url: window.location.origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${window.location.origin}/courses/library?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
      provider: {
        '@type': 'Organization',
        name: 'MegaCampusAI',
        url: window.location.origin,
      },
    }

    let jsonLdScript = document.querySelector('script[type="application/ld+json"]')
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script')
      jsonLdScript.setAttribute('type', 'application/ld+json')
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
    canonical.setAttribute('href', window.location.href)
  }, [])

  return null
}
