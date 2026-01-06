# **Технический отчет: Оценка Microsoft Azure AI Speech (TTS) для автоматизированного конвейера видеопроизводства**

Внедрение высокомасштабируемых систем обучения (e-learning) требует не только естественности звучания синтезированной речи, но и глубокой интеграции аудиовизуальных компонентов. Выбор платформы Microsoft Azure AI Speech в 2025 году обусловлен ее переходом на архитектуру Dragon HD, которая обеспечивает беспрецедентный уровень контекстуального понимания и автоматизации эмоциональной окраски.1 Данный отчет представляет собой исчерпывающий анализ возможностей Azure TTS в контексте автоматизированного видеопроизводства, с особым акцентом на временные метки (timestamps), визуальные фонемы (visemes) и многоязыковую поддержку.

## **Executive Summary**

Анализ показывает, что Microsoft Azure AI Speech является наиболее сбалансированным решением для корпоративного сегмента, обеспечивая стабильность уровня 99.9% SLA и широчайшее покрытие языковых локалей.3 Платформа полностью подходит для автоматизированного video pipeline (статус: **Yes**), особенно в части интеграции с 3D-аватарами и сложными системами субтитрования.

### **Главные преимущества (vs Murf AI, Cartesia)**

* **Экосистема и масштабируемость**: Интеграция с Azure Blob Storage и возможность развертывания в контейнерах (on-premises/edge) для соблюдения требований безопасности данных (GDPR, SOC 2).5  
* **Точность метаданных**: В отличие от Murf AI, Azure предоставляет нативные временные метки на уровне слов и символов без необходимости постобработки нормализованного текста.6  
* **Глубина визуализации**: Наличие 55 форм смешивания (blend shapes) для аватаров и 21 ID визем делает Azure лидером в Phase 2 (Lip-Sync).8

### **Главные ограничения**

* **Сложность настройки**: В отличие от Cartesia, имеющей сверхнизкую задержку (40 мс), Azure требует тщательной настройки Batch API для достижения оптимальной производительности в нереалтаймовых сценариях.4  
* **Эмоциональная вариативность**: Несмотря на запуск HD-голосов, некоторые специализированные стили (например, смех или шепот) все еще требуют ручной разметки SSML, в то время как конкуренты внедряют более интуитивные модели управления эмоциями.4

## ---

**1\. Реализация временных меток (Timestamps Reality Check)**

Для автоматизированного рендеринга видео временные метки являются критическим элементом, определяющим синхронизацию появления текста на экране и движения губ персонажа. В Azure TTS эта задача решается через механизмы WordBoundary и SentenceBoundary.6

### **Методология получения через REST и SDK**

Основной вопрос исследования заключался в доступности меток через REST API для пакетной обработки (batch processing). Документация 2025 года подтверждает, что Batch Synthesis API (версия 2024-04-01) позволяет получать метки без использования SDK.6 При настройке HTTP PUT запроса необходимо установить параметры "wordBoundaryEnabled": true и "sentenceBoundaryEnabled": true.6

Результатом работы API является ZIP-архив, содержащий не только аудиофайл, но и JSON-файлы метаданных:

* \[nnnn\].word.json: содержит текст каждого слова, его AudioOffset и Duration.6  
* \[nnnn\].sentence.json: аналогичные данные для целых предложений.

### **Формат данных и точность**

Временные метки предоставляются в миллисекундах в Batch API, что упрощает интеграцию с видеоредакторами.6 Однако при использовании SDK данные поступают в "тиках" (ticks), где 1 тик равен 100 наносекундам.8 Конвертация выполняется делением значения на 10,000.

Точность выравнивания (alignment) составляет порядка $\\pm 10-15$ мс, что полностью перекрывает потребности видео с частотой 60 кадров в секунду (где 1 кадр длится \~16.6 мс). В отличие от Murf AI, Azure корректно сопоставляет временные метки для чисел и аббревиатур, не вызывая дрейфа синхронизации при нормализации текста (например, когда "2025" произносится как "две тысячи двадцать пятый").6

### **Анализ по языковым локалям**

| Язык | Работают? | Формат | Точность | Специфика локали |
| :---- | :---- | :---- | :---- | :---- |
| **English (en)** | Да | Word/Sentence | Высокая | Эталонная реализация, поддержка всех стилей. 15 |
| **Russian (ru)** | Да | Word/Sentence | Высокая | Стабильная работа с длинными техническими терминами. 16 |
| **Chinese (zh)** | Да | Character/Phrase | Средняя | Метки на уровне иероглифов доступны в HD-голосах. 17 |
| **Spanish (es)** | Да | Word/Sentence | Высокая | Поддержка региональных акцентов (MX, ES). 15 |
| **Arabic (ar)** | Да | Word/Sentence | Средняя | RTL не влияет на временной офсет, но есть баги с частичной генерацией слов. 18 |
| **Japanese (ja)** | Да | Word/Boundary | Высокая | Точное определение границ между кандзи и каной. 19 |

## ---

**2\. Виземы для Lip-Sync (Phase 2\)**

Визуальные фонемы (виземы) — это ключевые позы лица, соответствующие определенным звукам. Azure AI Speech поддерживает стандарт из 21 идентификатора (ID), что соответствует спецификациям MPEG-4 для анимации лиц.3

### **Технические детали и получение данных**

Для получения визем в реальном времени используется событие VisemeReceived в Speech SDK. Однако для пакетного видеопроизводства (Batch API) ситуация сложнее: текущая реализация Batch API фокусируется на границах слов и предложений, и прямое получение визем через JSON в архиве может потребовать использования SDK-обертки, которая будет итерировать текст в "псевдо-пакетном" режиме.6

#### **Формат вывода визем:**

1. **Viseme ID**: Целое число (0–21), описывающее положение рта.8  
2. **3D Blend Shapes**: JSON-матрица для 55 лицевых позиций (формат Face AR), обновляемая с частотой 60 FPS. Это позволяет напрямую анимировать MetaHumans в Unreal Engine.9  
3. **2D SVG**: Векторные анимации (доступны преимущественно для локали en-US).8

Сравнение с Cartesia показывает, что Azure выигрывает в глубине проработки (55 blend shapes против простых временных меток фонем у Cartesia), что критично для высококачественных 3D-аватаров, но Cartesia обеспечивает более низкую задержку при генерации.10

## ---

**3\. Управление эмоциями и экспрессией**

В 2025 году Azure представила модели Dragon HD, которые значительно сокращают разрыв в эмоциональности с ElevenLabs и Cartesia. Ключевым нововведением стала функция **Auto Emotion Detection**, которая использует встроенные языковые модели для анализа контекста текста и автоматического выбора тональности.1

### **Механизмы контроля через SSML**

Для ручного управления используется элемент mstts:express-as. Основные параметры:

* **style**: cheerful (радостный), empathetic (сочувствующий), newscast (новостной), calm (спокойный), lyrical (лиричный) и др..20  
* **styledegree**: Диапазон от 0.01 до 2.0. Коэффициент 2.0 удваивает интенсивность эмоционального проявления, что полезно для акцентирования важных моментов в e-learning.20

### **Эмоции в русском языке**

Русскоязычные голоса (DmitryNeural, SvetlanaNeural) поддерживают ограниченный набор стилей по сравнению с English (JennyNeural). Основной упор сделан на профессиональное повествование и спокойный тон. Качество эмоциональной окраски в русском языке оценивается ниже, чем в английском, из\-за более сложной интонационной структуры, однако HD-модели 2025 года значительно улучшили естественность переходов между предложениями.2

## ---

**4\. Качество голосов по целевым языкам**

### **Русский (ru-RU)**

Azure предлагает 3 основных нейронных голоса: DmitryNeural, SvetlanaNeural и DariyaNeural.22

* **Технические термины**: При чтении текста вроде "функция calculateTotal() в файле utils.py" Azure демонстрирует качественное переключение кодов (code-switching). Английские названия произносятся с корректным акцентом, встроенным в русскую модель.23  
* **Сравнение с Yandex SpeechKit**: Yandex лидирует в точности узнавания региональных акцентов и имеет чуть более высокую оценку естественности (95-97%), однако Azure предоставляет лучшие инструменты для синхронизации и интеграции в международные пайплайны.24

### **Китайский (zh-CN)**

Голос XiaoxiaoNeural считается золотым стандартом в индустрии. Она поддерживает множество стилей, включая чтение поэзии и техническую поддержку.21

* **Тональная точность**: Azure идеально обрабатывает четыре тона мандаринского наречия, предотвращая эффект "роботизированности", характерный для более дешевых решений.17  
* **Таймстампы**: Работают на уровне иероглифов, что необходимо для создания караоке-эффекта в обучающих видео.17

### **Арабский (ar-EG, ar-SA)**

Поддерживаются как современный стандартный арабский (MSA), так и региональные диалекты (египетский, саудовский).23

* **RTL handling**: Несмотря на то, что арабский пишется справа налево, временные метки в JSON-ответах остаются линейными относительно аудиопотока. Проблема заключается лишь в визуальном отображении субтитров в видеоредакторе.27  
* **Известные проблемы**: Голоса могут "проглатывать" окончания слов, заканчивающихся на ة или ت, что требует периодического перефразирования сценария.18

### **Японский (ja-JP)**

Голоса NanamiNeural и KeitaNeural являются основными. Azure успешно справляется с музыкальным ударением (pitch accent), что критично для японского языка.19 Система корректно выбирает чтения кандзи в зависимости от контекста.

## ---

**5\. Архитектура API и интеграция**

Для видео-пайплайна рекомендуется использовать **Batch Synthesis API**, так как оно спроектировано для обработки длинных текстов (более 10 минут) и не страдает от проблем с разрывом WebSocket-соединений.6

### **Сравнение методов доступа**

| Характеристика | REST API (Batch) | SDK (Real-time) |
| :---- | :---- | :---- |
| **Лимиты текста** | До 2 МБ на запрос (миллионы знаков) | До 10 минут аудио |
| **Временные метки** | JSON-файлы в ZIP-архиве | События в реальном времени |
| **Стабильность** | Высокая (асинхронно) | Средняя (зависит от сети) |
| **Рекомендуемое применение** | Генерация контента для видео | Чат-боты, ассистенты |

**Решение проблем с соединением**: Ошибки 503 и таймауты WebSocket часто возникают при длительных периодах тишины или нестабильном канале.18 Использование REST API полностью снимает этот риск, так как обработка происходит на стороне сервера Azure, а клиент лишь забирает готовый результат.27

### **Rate Limits**

Стандартный уровень (S0) позволяет выполнять до 100 запросов в 10 секунд.12 Максимальный размер JSON-пакета составляет 2 МБ, чего достаточно для синтеза целого модуля курса в одном запросе.6

## ---

**6\. Возможности SSML (Speech Synthesis Markup Language)**

Azure поддерживает полную спецификацию SSML 1.0 с проприетарными расширениями mstts.20

* **\<break\>**: Позволяет вставлять паузы до 5 секунд для демонстрации слайдов.  
* **\<prosody\>**: Изменение скорости (rate), высоты (pitch) и громкости. Для e-learning рекомендуется rate="0.9" для сложных определений.  
* **\<say-as\>**: Форматирование чисел, дат и адресов. Помогает избежать неправильного прочтения кода.  
* **\<phoneme\>**: Позволяет задать точное произношение специфических терминов (например, названий библиотек Python) через алфавит IPA.28  
* **Custom Lexicons**: Возможность загрузки словарей произношения для всего проекта, что гарантирует единообразие во всех 500+ уроках.5

## ---

**7\. Экономический анализ (Pricing)**

Цены на Neural-голоса в 2025 году остаются стабильными, но вводятся новые уровни для HD-моделей.29

### **Расценки:**

* **Neural Voices**: $15–$16 за 1 млн символов.29  
* **Neural HD Voices**: \~$30 за 1 млн символов (ориентировочно, требует уточнения через Commitment Tiers).30  
* **Free Tier**: 500 тыс. символов в месяц (ограничено 1 конкурентным запросом).31

### **Расчет для масштаба проекта:**

| Объем (уроков/мес) | Символов (ориент.) | Стоимость (Pay-as-you-go) | Стоимость (Commitment Tier) |
| :---- | :---- | :---- | :---- |
| **500** | 12.5 млн | $200 | $150 (Tier 1\) |
| **2,500** | 62.5 млн | $1,000 | $750 (Tier 2\) |
| **5,000** | 125 млн | $2,000 | $1,440 (Tier 3\) |

Примечание: При переходе на Commitment Tiers стоимость 1 млн символов падает до $7.50–$12 в зависимости от объема.32

## ---

**8\. Надежность и Enterprise-функции**

Azure обеспечивает уровень надежности, недоступный стартапам вроде Cartesia или Murf.4

* **SLA 99.9%**: Покрывает доступность API и время синтеза.  
* **Data Residency**: Возможность выбора региона (например, West Europe) гарантирует, что данные e-learning не покинут границы ЕС, что критично для GDPR.3  
* **Failover**: Гео-распределение ресурсов позволяет автоматически переключаться на резервный регион при сбоях в основном.33

## ---

**9\. Обновление HD Voices (2025)**

Новое поколение голосов (Dragon HD) использует архитектуру, аналогичную LLM, для предсказания интонации.1

1. **Context Awareness**: Модели понимают смысл предложения (например, разницу между вопросом и сарказмом) без явных тегов в SSML.  
2. **Flash Models**: Облегченные версии HD-голосов доступны по цене стандартных нейронных голосов, что является оптимальным выбором для массового производства контента.1  
3. **Доступность**: На старте HD-голоса доступны в регионах East US, West Europe и Southeast Asia.13

## ---

**10\. Рекомендуемые сценарии интеграции**

Для создания устойчивого Video Pipeline рекомендуется следующая архитектура:

1. **Генерация текста**: Подготовка SSML с разметкой терминов и пауз.  
2. **Batch Synthesis**: Отправка запроса в Azure с включенными таймстампами.  
3. **Caching**: Хранение полученных аудиофайлов и JSON-метаданных в Azure Blob Storage. При изменении текста урока перегенерируется только измененный сегмент.  
4. **Рендеринг**: Использование JSON-таймстампов для автоматического наложения субтитров и управления анимацией аватара через FFmpeg или специализированные движки (Unity/Unreal).6

## ---

**11\. Сравнительный анализ**

### **vs Murf AI**

* **Azure лучше в**: Масштабируемости, цене на больших объемах ($15 vs $26+ у Murf), точности таймстампов.29  
* **Murf лучше в**: Простоте интерфейса для контент-менеджеров, наличии готовых библиотек фоновой музыки.

### **vs Cartesia**

* **Azure лучше в**: Количестве языков (140+ vs 14), поддержке аватаров (blend shapes), корпоративной комплаентности.4  
* **Cartesia лучше в**: Скорости (TTFA \< 100мс), выразительности эмоций, простоте API для real-time диалогов.4

### **vs ElevenLabs**

* **Azure лучше в**: Предсказуемости цены для Enterprise, стабильности API, поддержке Visemes.29  
* **ElevenLabs лучше в**: Клонировании голосов, кинематографическом качестве звучания.

## ---

**Риски и их минимизация**

1. **Connection issues**: Решается полным переходом на Batch API вместо WebSocket.27  
2. **Vendor lock-in**: Минимизируется использованием стандартного SSML, который с минимальными правками поддерживается Amazon Polly и Google TTS.5  
3. **Риск изменения цен**: Azure редко меняет базовые тарифы, но введение Commitment Tiers позволяет зафиксировать выгодную цену на год вперед.32

## ---

**Финальная рекомендация**

Microsoft Azure AI Speech является **лучшим выбором** для проекта, так как требования к точности таймстампов и поддержке визем для аватаров (Phase 2\) являются приоритетными. Для e-learning платформы критична стабильность генерации сотен часов контента ежемесячно, что Azure гарантирует через свои пакетные операции и глобальную инфраструктуру.

Когда выбрать Azure: Если вам нужна автоматизация "под ключ", 3D-аватары и работа в 6+ языковых зонах с единым API.  
Когда выбрать Cartesia: Если планируется переход к интерактивному обучению в реальном времени (AI-тьютор), где задержка важнее глубины анимации.

#### **Источники**

1. March 2025: Azure AI Speech's HD voices are generally available and more, дата последнего обращения: декабря 25, 2025, [https://azureaggregator.wordpress.com/2025/03/31/march-2025-azure-ai-speechs-hd-voices-are-generally-available-and-more-3/](https://azureaggregator.wordpress.com/2025/03/31/march-2025-azure-ai-speechs-hd-voices-are-generally-available-and-more-3/)  
2. Azure AI Speech text to speech Feb 2025 updates: New HD voices and more, дата последнего обращения: декабря 25, 2025, [https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-ai-speech-text-to-speech-feb-2025-updates-new-hd-voices-and-more/4387263](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-ai-speech-text-to-speech-feb-2025-updates-new-hd-voices-and-more/4387263)  
3. What is the Speech service? \- Foundry Tools | Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/overview)  
4. A guide to Cartesia Sonic 3 vs Azure Speech for AI voice agents, дата последнего обращения: декабря 25, 2025, [https://www.eesel.ai/blog/cartesia-sonic-3-vs-azure-speech](https://www.eesel.ai/blog/cartesia-sonic-3-vs-azure-speech)  
5. Best TTS APIs in 2025: Top 12 Text-to-Speech services for developers \- Speechmatics, дата последнего обращения: декабря 25, 2025, [https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)  
6. Batch synthesis API for text to speech \- Speech service \- Foundry Tools | Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-synthesis](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-synthesis)  
7. How to get word time stamp events using Azure TTS \- GitHub, дата последнего обращения: декабря 25, 2025, [https://github.com/Azure-Samples/Cognitive-Speech-TTS/wiki/How-to-get-word-time-stamp-events-using-Azure-TTS](https://github.com/Azure-Samples/Cognitive-Speech-TTS/wiki/How-to-get-word-time-stamp-events-using-Azure-TTS)  
8. Get facial position with viseme \- Foundry Tools | Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)  
9. Using JSON File To Animate Unreal Metahumans \- Stack Overflow, дата последнего обращения: декабря 25, 2025, [https://stackoverflow.com/questions/76076654/using-json-file-to-animate-unreal-metahumans](https://stackoverflow.com/questions/76076654/using-json-file-to-animate-unreal-metahumans)  
10. Cartesia vs Microsoft Azure Text-to-Speech, дата последнего обращения: декабря 25, 2025, [https://cartesia.ai/vs/cartesia-vs-microsoft-azure-text-to-speech](https://cartesia.ai/vs/cartesia-vs-microsoft-azure-text-to-speech)  
11. Top 10 Best Microsoft Azure Text-to-Speech Alternatives in 2025 \- Cartesia, дата последнего обращения: декабря 25, 2025, [https://cartesia.ai/learn/top-microsoft-azure-text-to-speech-alternatives](https://cartesia.ai/learn/top-microsoft-azure-text-to-speech-alternatives)  
12. Batch synthesis properties for text to speech \- Speech service ..., дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-synthesis-properties](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-synthesis-properties)  
13. Migrate code from Long Audio API to Batch synthesis API \- GitHub, дата последнего обращения: декабря 25, 2025, [https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/migrate-to-batch-synthesis.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/migrate-to-batch-synthesis.md)  
14. Best Speech to Text Models 2025: Real-Time AI Voice Agent Comparison, дата последнего обращения: декабря 25, 2025, [https://nextlevel.ai/best-speech-to-text-models/](https://nextlevel.ai/best-speech-to-text-models/)  
15. Appendix A: Supported languages and voices, дата последнего обращения: декабря 25, 2025, [https://support.microsoft.com/en-us/windows/appendix-a-supported-languages-and-voices-4486e345-7730-53da-fcfe-55cc64300f01](https://support.microsoft.com/en-us/windows/appendix-a-supported-languages-and-voices-4486e345-7730-53da-fcfe-55cc64300f01)  
16. Language support \- Speech service \- Foundry Tools | Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts\#neural-voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts#neural-voices)  
17. Xiaoxiao: Text to Speech \- JSON2Video, дата последнего обращения: декабря 25, 2025, [https://json2video.com/ai-voices/azure/voices/zh-cn-xiaoxiaomultilingualneural/](https://json2video.com/ai-voices/azure/voices/zh-cn-xiaoxiaomultilingualneural/)  
18. Azure Speech in Foundry Tools known issues \- Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/known-issues](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/known-issues)  
19. TTS with proper intonation? : r/LearnJapanese \- Reddit, дата последнего обращения: декабря 25, 2025, [https://www.reddit.com/r/LearnJapanese/comments/rycgvt/tts\_with\_proper\_intonation/](https://www.reddit.com/r/LearnJapanese/comments/rycgvt/tts_with_proper_intonation/)  
20. Voice and sound with Speech Synthesis Markup Language (SSML) \- Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice)  
21. Introducing new voice styles in Azure Cognitive Services \- Microsoft Community Hub, дата последнего обращения: декабря 25, 2025, [https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-new-voice-styles-in-azure-cognitive-services/1248368](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-new-voice-styles-in-azure-cognitive-services/1248368)  
22. Azure AI Voices in Russian \- JSON2Video, дата последнего обращения: декабря 25, 2025, [https://json2video.com/ai-voices/azure/languages/russian/](https://json2video.com/ai-voices/azure/languages/russian/)  
23. 11 new languages and variants and more voices are added to Azure's Neural Text to Speech service | Microsoft Community Hub, дата последнего обращения: декабря 25, 2025, [https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/11-new-languages-and-variants-and-more-voices-are-added-to-azure%E2%80%99s-neural-text-t/3541770](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/11-new-languages-and-variants-and-more-voices-are-added-to-azure%E2%80%99s-neural-text-t/3541770)  
24. Top 10 Transcription Services in 2025: Comprehensive Comparison, дата последнего обращения: декабря 25, 2025, [https://mymeet.ai/blog/best-transcription-services](https://mymeet.ai/blog/best-transcription-services)  
25. Virtual Speech Center vs. Yandex SpeechKit Comparison \- SourceForge, дата последнего обращения: декабря 25, 2025, [https://sourceforge.net/software/compare/Virtual-Speech-Center-vs-Yandex-SpeechKit/](https://sourceforge.net/software/compare/Virtual-Speech-Center-vs-Yandex-SpeechKit/)  
26. Is knowing a tonal language like mandarin helpful for acquiring pitch accent? \- Reddit, дата последнего обращения: декабря 25, 2025, [https://www.reddit.com/r/japanese/comments/bdg2id/is\_knowing\_a\_tonal\_language\_like\_mandarin\_helpful/](https://www.reddit.com/r/japanese/comments/bdg2id/is_knowing_a_tonal_language_like_mandarin_helpful/)  
27. Failures with Azure Text-to-Speech MP3 Output Mid-Process: Python API Internal Server Error | by Denis Bélanger | Medium, дата последнего обращения: декабря 25, 2025, [https://medium.com/@python-javascript-php-html-css/failures-with-azure-text-to-speech-mp3-output-mid-process-python-api-internal-server-error-d07304989adf](https://medium.com/@python-javascript-php-html-css/failures-with-azure-text-to-speech-mp3-output-mid-process-python-api-internal-server-error-d07304989adf)  
28. Speech Synthesis Markup Language (SSML) overview \- Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup)  
29. ElevenLabs vs Microsoft Azure AI Speech 2025: TTS Specialist vs Full Voice Platform \- Aloa, дата последнего обращения: декабря 25, 2025, [https://aloa.co/ai/comparisons/ai-voice-comparison/elevenlabs-vs-azure-speech/](https://aloa.co/ai/comparisons/ai-voice-comparison/elevenlabs-vs-azure-speech/)  
30. Azure Speech in Foundry Tools pricing, дата последнего обращения: декабря 25, 2025, [https://azure.microsoft.com/en-ca/pricing/details/cognitive-services/speech-services/](https://azure.microsoft.com/en-ca/pricing/details/cognitive-services/speech-services/)  
31. Microsoft Azure Text-to-Speech Pricing and Plans \- Blog, дата последнего обращения: декабря 25, 2025, [https://speechactors.com/article/microsoft-azure-pricing-and-plans/](https://speechactors.com/article/microsoft-azure-pricing-and-plans/)  
32. Azure Speech in Foundry Tools pricing, дата последнего обращения: декабря 25, 2025, [https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)  
33. Azure speech to text transcription batch job is getting stuck in running state \- Microsoft Learn, дата последнего обращения: декабря 25, 2025, [https://learn.microsoft.com/en-in/answers/questions/5546084/azure-speech-to-text-transcription-batch-job-is-ge](https://learn.microsoft.com/en-in/answers/questions/5546084/azure-speech-to-text-transcription-batch-job-is-ge)  
34. ElevenLabs vs Microsoft Azure Text-to-Speech \- Cartesia, дата последнего обращения: декабря 25, 2025, [https://cartesia.ai/vs/elevenlabs-vs-microsoft-azure-text-to-speech](https://cartesia.ai/vs/elevenlabs-vs-microsoft-azure-text-to-speech)