# Azure TTS: Пошаговая настройка для Video Pipeline

> **Версия:** 1.0
> **Дата:** 2025-12-29
> **Статус:** Production Ready

## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Создание Azure Speech Resource](#2-создание-azure-speech-resource)
3. [Получение ключей и endpoint](#3-получение-ключей-и-endpoint)
4. [Выбор региона](#4-выбор-региона)
5. [Выбор голоса](#5-выбор-голоса)
6. [Настройка Batch Synthesis API](#6-настройка-batch-synthesis-api)
7. [Форматы аудио](#7-форматы-аудио)
8. [Тестирование API](#8-тестирование-api)
9. [Переменные окружения](#9-переменные-окружения)
10. [Чеклист настройки](#10-чеклист-настройки)

---

## 1. Предварительные требования

- [ ] **Azure аккаунт** — [создать бесплатно](https://azure.microsoft.com/pricing/purchase-options/azure-account)
- [ ] **Способ оплаты** — привязанная карта (для Standard tier)
- [ ] **curl или Postman** — для тестирования API

### Бесплатный уровень (F0)

| Параметр | Лимит |
|----------|-------|
| Символов в месяц | 500,000 |
| Ограничение | Не все регионы поддерживают F0 для Batch Synthesis |

> **Рекомендация:** Для production используйте **Standard (S0)** tier

---

## 2. Создание Azure Speech Resource

### Шаг 2.1: Войти в Azure Portal

1. Перейти на [portal.azure.com](https://portal.azure.com)
2. Войти с Azure аккаунтом

### Шаг 2.2: Создать ресурс

1. В поиске набрать **"Speech"**
2. Выбрать **"Speech"** (Azure AI services)
3. Нажать **"Create"**

### Шаг 2.3: Заполнить форму

| Поле | Значение | Примечание |
|------|----------|------------|
| **Subscription** | Ваша подписка | — |
| **Resource group** | Создать новый или выбрать | Рекомендуется: `megacampus-ai-rg` |
| **Region** | `West Europe` | См. раздел 4 для выбора |
| **Name** | `megacampus-speech` | Уникальное имя |
| **Pricing tier** | `Standard S0` | Для production |

### Шаг 2.4: Создать

1. Нажать **"Review + create"**
2. Проверить конфигурацию
3. Нажать **"Create"**
4. Дождаться deployment (~1-2 минуты)

---

## 3. Получение ключей и endpoint

### Шаг 3.1: Перейти к ресурсу

1. После создания нажать **"Go to resource"**
2. Или найти ресурс в Resource Group

### Шаг 3.2: Скопировать ключи

1. В левом меню выбрать **"Keys and Endpoint"**
2. Скопировать:

| Параметр | Где найти | Пример |
|----------|-----------|--------|
| **KEY 1** | Keys and Endpoint | `a1b2c3d4e5f6...` |
| **KEY 2** | Keys and Endpoint | `f6e5d4c3b2a1...` (backup) |
| **Region** | Keys and Endpoint | `westeurope` |
| **Endpoint** | Keys and Endpoint | `https://westeurope.api.cognitive.microsoft.com/` |

> **Важно:** KEY 1 и KEY 2 равнозначны. KEY 2 используется для rotation без downtime.

---

## 4. Выбор региона

### Регионы с поддержкой Batch Synthesis API

| Регион | Код | Рекомендация |
|--------|-----|--------------|
| **West Europe** | `westeurope` | Ближайший к RU/EU |
| **North Europe** | `northeurope` | Альтернатива EU |
| **East US** | `eastus` | Америка |
| **East US 2** | `eastus2` | Америка (backup) |
| **Southeast Asia** | `southeastasia` | Азия |
| **Japan East** | `japaneast` | Япония |
| **Australia East** | `australiaeast` | Австралия |
| **Central India** | `centralindia` | Индия |
| **UAE North** | `uaenorth` | Ближний Восток |

### Полный список поддерживаемых регионов

```
australiaeast, brazilsouth, canadacentral, centralindia,
eastasia, eastus, eastus2, francecentral, germanywestcentral,
japaneast, koreacentral, northcentralus, northeurope,
norwayeast, southafricanorth, southcentralus, southeastasia,
swedencentral, uksouth, westcentralus, westeurope,
westus, westus2, westus3
```

> **Рекомендация для MegaCampus:** `westeurope` — оптимальная задержка для RU/EU пользователей

---

## 5. Выбор голоса

### Русский (ru-RU)

| Голос | Пол | Рекомендация |
|-------|-----|--------------|
| `ru-RU-DmitryNeural` | Мужской | **Рекомендуется** для e-learning |
| `ru-RU-SvetlanaNeural` | Женский | Альтернатива |
| `ru-RU-DariyaNeural` | Женский | Альтернатива |

### Английский (en-US)

| Голос | Пол | Особенности |
|-------|-----|-------------|
| `en-US-AndrewNeural` | Мужской | Естественный, для обучения |
| `en-US-AvaNeural` | Женский | Premium качество |
| `en-US-JennyNeural` | Женский | Универсальный |
| `en-US-GuyNeural` | Мужской | Профессиональный |

### Китайский (zh-CN)

| Голос | Пол | Особенности |
|-------|-----|-------------|
| `zh-CN-YunxiNeural` | Мужской | Role-play поддержка |
| `zh-CN-XiaoxiaoNeural` | Женский | Популярный |
| `zh-CN-YunyangNeural` | Мужской | Новостной стиль |

### Японский (ja-JP)

| Голос | Пол | Особенности |
|-------|-----|-------------|
| `ja-JP-KeitaNeural` | Мужской | Рекомендуется |
| `ja-JP-NanamiNeural` | Женский | Популярный |
| `ja-JP-MasaruMultilingualNeural` | Мужской | Мультиязычный |

### Арабский (ar-SA / ar-EG)

| Голос | Регион | Пол |
|-------|--------|-----|
| `ar-SA-HamedNeural` | Саудовская Аравия | Мужской |
| `ar-SA-ZariyahNeural` | Саудовская Аравия | Женский |
| `ar-EG-ShakirNeural` | Египет | Мужской |
| `ar-EG-SalmaNeural` | Египет | Женский |

### Испанский (es-ES / es-MX)

| Голос | Регион | Пол |
|-------|--------|-----|
| `es-ES-AlvaroNeural` | Испания | Мужской |
| `es-ES-ElviraNeural` | Испания | Женский |
| `es-MX-JorgeNeural` | Мексика | Мужской |
| `es-MX-DaliaNeural` | Мексика | Женский |

---

## 6. Настройка Batch Synthesis API

### 6.1 API Endpoint Format

```
https://{region}.api.cognitive.microsoft.com/texttospeech/batchsyntheses/{synthesis_id}?api-version=2024-04-01
```

### 6.2 Создание Batch Synthesis Job

**HTTP PUT Request:**

```bash
curl -X PUT "https://westeurope.api.cognitive.microsoft.com/texttospeech/batchsyntheses/my-synthesis-001?api-version=2024-04-01" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Lesson 1 narration",
    "inputKind": "SSML",
    "inputs": [
      {
        "content": "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"ru-RU\"><voice name=\"ru-RU-DmitryNeural\">Добро пожаловать на первый урок курса.</voice></speak>"
      }
    ],
    "properties": {
      "outputFormat": "audio-24khz-160kbitrate-mono-mp3",
      "wordBoundaryEnabled": true,
      "sentenceBoundaryEnabled": true,
      "concatenateResult": true
    }
  }'
```

### 6.3 Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `inputKind` | string | Да | `"SSML"` или `"PlainText"` |
| `inputs` | array | Да | Массив текстов (до 1000 элементов) |
| `properties.outputFormat` | string | Нет | Формат аудио |
| `properties.wordBoundaryEnabled` | boolean | Нет | **Включить word timestamps** |
| `properties.sentenceBoundaryEnabled` | boolean | Нет | Включить sentence timestamps |
| `properties.concatenateResult` | boolean | Нет | Объединить в один файл |
| `properties.timeToLiveInHours` | number | Нет | Время хранения (7-31 дней) |

### 6.4 Проверка статуса

```bash
curl -X GET "https://westeurope.api.cognitive.microsoft.com/texttospeech/batchsyntheses/my-synthesis-001?api-version=2024-04-01" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY"
```

**Статусы:**
- `Running` — в процессе
- `Succeeded` — готово
- `Failed` — ошибка

### 6.5 Формат Word Timestamps

При `wordBoundaryEnabled: true` создается файл `[nnnn].word.json`:

```json
[
  {
    "Text": "Добро",
    "AudioOffset": 50,
    "Duration": 287
  },
  {
    "Text": "пожаловать",
    "AudioOffset": 350,
    "Duration": 512
  },
  {
    "Text": "на",
    "AudioOffset": 875,
    "Duration": 125
  }
]
```

> **AudioOffset** и **Duration** — в миллисекундах (ms)

---

## 7. Форматы аудио

### Рекомендуемые для Video Pipeline

| Формат | Sample Rate | Bitrate | Использование |
|--------|-------------|---------|---------------|
| `audio-24khz-160kbitrate-mono-mp3` | 24 kHz | 160 kbps | **Рекомендуется** для видео |
| `audio-48khz-192kbitrate-mono-mp3` | 48 kHz | 192 kbps | Высокое качество |
| `riff-24khz-16bit-mono-pcm` | 24 kHz | WAV | Для постобработки |

### Все доступные форматы

**MP3:**
```
audio-16khz-32kbitrate-mono-mp3
audio-16khz-64kbitrate-mono-mp3
audio-16khz-128kbitrate-mono-mp3
audio-24khz-48kbitrate-mono-mp3
audio-24khz-96kbitrate-mono-mp3
audio-24khz-160kbitrate-mono-mp3
audio-48khz-96kbitrate-mono-mp3
audio-48khz-192kbitrate-mono-mp3
```

**WAV (PCM):**
```
riff-8khz-16bit-mono-pcm
riff-16khz-16bit-mono-pcm
riff-24khz-16bit-mono-pcm
riff-44100hz-16bit-mono-pcm
riff-48khz-16bit-mono-pcm
```

**OGG/WebM:**
```
ogg-16khz-16bit-mono-opus
ogg-24khz-16bit-mono-opus
ogg-48khz-16bit-mono-opus
webm-24khz-16bit-mono-opus
```

---

## 8. Тестирование API

### 8.1 Получить список голосов

```bash
curl -X GET "https://westeurope.tts.speech.microsoft.com/cognitiveservices/voices/list" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY"
```

### 8.2 Простой тест синтеза (Real-time)

```bash
curl -X POST "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY" \
  -H "Content-Type: application/ssml+xml" \
  -H "X-Microsoft-OutputFormat: audio-24khz-160kbitrate-mono-mp3" \
  --data '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">
    <voice name="ru-RU-DmitryNeural">Тестовое сообщение для проверки Azure TTS.</voice>
  </speak>' \
  --output test-audio.mp3
```

### 8.3 Тест Batch Synthesis с timestamps

```bash
# 1. Создать job
curl -X PUT "https://westeurope.api.cognitive.microsoft.com/texttospeech/batchsyntheses/test-timestamps-001?api-version=2024-04-01" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputKind": "SSML",
    "inputs": [
      {
        "content": "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"ru-RU\"><voice name=\"ru-RU-DmitryNeural\">Это тестовое сообщение для проверки word-level timestamps в Azure Batch Synthesis API.</voice></speak>"
      }
    ],
    "properties": {
      "outputFormat": "audio-24khz-160kbitrate-mono-mp3",
      "wordBoundaryEnabled": true
    }
  }'

# 2. Проверить статус (подождать ~20 секунд)
curl -X GET "https://westeurope.api.cognitive.microsoft.com/texttospeech/batchsyntheses/test-timestamps-001?api-version=2024-04-01" \
  -H "Ocp-Apim-Subscription-Key: YOUR_SPEECH_KEY"

# 3. Скачать результат (URL из ответа предыдущего запроса)
# outputs.result содержит URL для скачивания
```

---

## 9. Переменные окружения

### Локальная разработка (.env)

```env
# Azure Speech Service
AZURE_SPEECH_KEY=your_subscription_key_here
AZURE_SPEECH_REGION=westeurope
AZURE_SPEECH_ENDPOINT=https://westeurope.api.cognitive.microsoft.com/

# TTS Configuration
AZURE_TTS_VOICE_RU=ru-RU-DmitryNeural
AZURE_TTS_VOICE_EN=en-US-AndrewNeural
AZURE_TTS_VOICE_ZH=zh-CN-YunxiNeural
AZURE_TTS_VOICE_JA=ja-JP-KeitaNeural
AZURE_TTS_VOICE_AR=ar-SA-HamedNeural
AZURE_TTS_VOICE_ES=es-ES-AlvaroNeural
AZURE_TTS_OUTPUT_FORMAT=audio-24khz-160kbitrate-mono-mp3
```

### Production (Supabase Secrets / Server ENV)

```bash
# Добавить в secrets
AZURE_SPEECH_KEY=your_production_key
AZURE_SPEECH_REGION=westeurope
```

---

## 10. Чеклист настройки

### Обязательные шаги

- [ ] Создан Azure аккаунт
- [ ] Создан Speech Resource в Azure Portal
- [ ] Выбран регион: `________________`
- [ ] Скопирован KEY 1: `________________`
- [ ] Скопирован KEY 2 (backup): `________________`
- [ ] Протестирован Real-time TTS endpoint
- [ ] Протестирован Batch Synthesis endpoint
- [ ] Word timestamps работают корректно
- [ ] Переменные добавлены в .env

### Результаты тестирования

| Тест | Статус | Примечания |
|------|--------|------------|
| Voices List API | [ ] OK / [ ] FAIL | |
| Real-time TTS | [ ] OK / [ ] FAIL | |
| Batch Synthesis | [ ] OK / [ ] FAIL | |
| Word Timestamps | [ ] OK / [ ] FAIL | |
| Russian voice | [ ] OK / [ ] FAIL | |
| English voice | [ ] OK / [ ] FAIL | |

### Данные для конфигурации

```
Region: ____________________
KEY 1: ____________________
Endpoint: ____________________
Default Voice (RU): ____________________
Default Voice (EN): ____________________
```

---

## Полезные ссылки

- [Azure Portal](https://portal.azure.com)
- [Batch Synthesis Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-synthesis)
- [Voice Gallery](https://speech.microsoft.com/portal/voicegallery)
- [SSML Reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup)
- [Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)

---

## Pricing Reference

| Tier | Лимит | Цена |
|------|-------|------|
| Free (F0) | 500K символов/месяц | $0 |
| Standard (S0) | Без лимита | ~$16 / 1M символов |
| Neural HD | Premium качество | ~$30 / 1M символов |

> **Расчет для MegaCampus:** 5,000 уроков × 25,000 символов = 125M символов/месяц ≈ $2,000/месяц

---

*Документ создан: 2025-12-29*
*Последнее обновление: 2025-12-29*
