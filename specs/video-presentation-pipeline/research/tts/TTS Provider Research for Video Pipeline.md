# **Deep Research: TTS Solutions for Video Presentation Pipeline (2024-2025)**

## **1\. Introduction: The Synchronization Imperative in Automated Video Generation**

The rapid democratization of e-learning content creation has shifted the bottleneck from curriculum design to production logistics. In building an automated video presentation pipeline, the role of Text-to-Speech (TTS) technology transcends mere vocalization; it becomes the structural backbone of the entire visual experience. Unlike conversational agents, where the primary metric is latency, or audiobook synthesis, where the priority is long-form prosody, a video pipeline demands a rigorous, almost mechanical adherence to temporal precision. The user is not just listening; they are watching. A slide transition that lags behind the narration by 500 milliseconds, or a code snippet that highlights before the instructor mentions the function name, creates a cognitive dissonance that degrades the learning experience.

This report evaluates the current landscape of TTS providers through the specific lens of this "synchronization imperative." The requirement for native word and character-level timestamps is the filter that separates general-purpose voice synthesis engines from production-grade infrastructure. While the market has seen an explosion of "Generative Voice" startups promising hyper-realistic emotion and cloning capabilities, our analysis reveals a significant bifurcation in feature sets. The legacy cloud providers—Microsoft Azure, Amazon Web Services (AWS), and Google Cloud Platform (GCP)—have spent a decade refining the metadata layers of their speech services, treating audio as a data-rich stream. In contrast, the newer wave of AI-native companies—ElevenLabs, Deepgram, and Cartesia—initially focused purely on acoustic fidelity and latency, only recently retrofitting alignment capabilities to meet enterprise demands.

Navigating this landscape requires balancing three competing vectors: **Audio Quality** (the "human" factor), **Metadata Precision** (the "control" factor), and **Cost Efficiency** (the "scale" factor). Our research indicates that while AI-native models are pushing the boundaries of realism, often achieving indistinguishable-from-human results, they frequently impose a "tax" in the form of higher costs and integration complexity regarding timestamps. Conversely, the established hyperscalers offer robust, predictable control mechanisms and lower costs, but sometimes lag in the raw emotional resonance of the voice.

This document serves as a comprehensive technical and commercial roadmap for selecting a provider that can scale from 500 to 5,000 lessons per month. It specifically addresses the critical linguistic requirements of a global curriculum—spanning English, Russian, Chinese, Spanish, Arabic, and Japanese—and dissects the integration challenges inherent in synchronizing these diverse phonetic systems with a visual engine.

## ---

**2\. Technical Architecture of Time-Synchronized Speech**

To make an informed selection, it is necessary to deconstruct the mechanics of how TTS engines generate timing data and why "native" support is a non-negotiable requirement for a video pipeline.

### **2.1 The Mechanics of Native Alignment vs. Post-Hoc Forced Alignment**

The generation of speech from text involves a complex transformation of graphemes (written characters) into phonemes (sounds) and subsequently into acoustic waveforms.

**Native Generation (The Gold Standard):** In modern neural TTS architectures (like FastSpeech 2 or Tacotron 2 variants used by Azure and Google), the model inherently predicts the duration of each phoneme as part of the synthesis process. The "attention alignment" map—which connects the encoder (text) to the decoder (audio)—contains the precise start and end times of every token. When a provider exposes this data natively, they are essentially giving you the internal clock of the model. This guarantees that the timestamp perfectly matches the generated audio because they are products of the same inference step. For a video pipeline, this frame-perfect accuracy is essential.

**Post-Hoc Forced Alignment (The "ASR" Fallback):** Some workflows attempt to circumvent a lack of native timestamps by generating audio and then feeding it back into an Automatic Speech Recognition (ASR) system (like OpenAI Whisper) to obtain timestamps. While functionally possible, this introduces a "double latency" penalty and, more critically, "alignment drift." ASR models are probabilistic; they "guess" where a word starts based on acoustics. If the TTS voice speaks quickly, slurs a word for stylistic effect, or uses dramatic pauses (common in the "Teacher" persona), the ASR might misalign the timestamp by 100-300ms. In a video context, a 300ms drift results in a visible desynchronization between the audio and the visual cue (e.g., a laser pointer moving on a slide), breaking the user's immersion. Furthermore, ASR fallback doubles the cost structure, as one pays for both synthesis and transcription.1

Therefore, providers that lack native timestamp support—most notably OpenAI’s standard tts-1 and tts-1-hd endpoints—are functionally disqualified for the core production pipeline unless a significant engineering overhead for alignment correction is accepted. While recent community discussions suggest OpenAI is improving its snapshot models 3, native timestamping remains an "experimental" or "undocumented" feature compared to the mature implementations of Azure and AWS.

### **2.2 Granularity Levels: Word, Character, and Viseme**

The requirement for "timestamps" must be broken down into granularity levels, each serving a different visual function in the e-learning video.

* **Word-Level Timestamps:** This is the baseline requirement for slide transitions and standard subtitles. It allows the video engine to trigger a "Next Slide" event when the narrator finishes a specific sentence or highlights a keyword. All "Timestamp-Ready" providers support this.  
* **Character-Level Timestamps:** This is critical for "typewriter effects," often used in coding tutorials where code appears on screen character-by-character as it is read. This is significantly harder to implement for languages with complex orthography like Chinese or Arabic. Azure and ElevenLabs excel here, providing arrays of character offsets that can be directly mapped to animation frames.  
* **Viseme-Level (Visual Phoneme) Data:** This is the frontier of automated video. A viseme describes the shape of the mouth (e.g., the visual shape for the sound /f/ vs /m/). If the pipeline intends to use AI avatars (lips-synced characters), access to a stream of Viseme IDs is crucial. Microsoft Azure is the clear leader in this niche, providing a standardized set of 21 Viseme IDs (based on the MPEG-4 standard) that map directly to facial animation rigs.4 Amazon Polly also provides this via "Speech Marks," but newer generative models often abstract this layer away, forcing developers to use separate "audio-to-face" neural networks which add latency and cost.

### **2.3 The "Drift" and "Hallucination" Factor in Generative Models**

A hidden risk in using Large Language Model (LLM)-based TTS (like newer iterations of ElevenLabs or experimental "Generative" Polly voices) is hallucination. Unlike standard neural TTS, which is strictly constrained to the input text, generative models act as "continuations" of the audio prompt. They can occasionally insert pauses, sighs, or even repeat words that were not in the script to enhance "naturalness." If the timestamping engine does not account for these generative artifacts, the visual synchronization will break. Azure's neural engines are generally more "constrained" and reliable in this regard, adhering strictly to the script, which is preferable for educational content where accuracy is paramount.6

## ---

**3\. Detailed Provider Analysis: The Hyperscalers**

The "Hyperscalers" represent the safe, enterprise-grade choice. They treat TTS as a utility, prioritizing reliability and metadata over raw emotional range.

### **3.1 Microsoft Azure AI Speech (The Production Standard)**

Microsoft Azure has established itself as the de facto standard for synchronized speech applications. Its "Neural" tier voices are ubiquitous in the industry, and its metadata implementation is the most mature.

Timestamp Implementation:  
Azure does not require the user to "tag" the text manually. Instead, it offers a WordBoundary event (in the SDK) or a detailed JSON response (in the REST API). The system returns a stream of objects containing the AudioOffset (time in "ticks", where 1 tick \= 100 nanoseconds) and Duration.

* **Precision:** The alignment is generated during the synthesis pass, ensuring zero drift.  
* **Visemes:** As noted, Azure returns Viseme IDs, enabling high-fidelity avatar lip-sync without external processing.4  
* **Integration:** The SDK is available in Python, C\#, and JavaScript. For a backend video pipeline, the Python SDK or REST API is ideal. The AudioOffset must be converted: Offset (ms) \= Ticks / 10,000.

**Language Support (Core 6):**

* **English (en-US/GB):** Hundreds of voices. "Jenny" and "Guy" are industry standards. The "Multilingual" voices allow for seamless code-switching.  
* **Russian (ru-RU):** Azure's Russian voices (e.g., DmitryNeural, SvetlanaNeural) are highly rated for their clarity and correct handling of stress placement, a common pain point in Russian TTS. They handle technical jargon reasonably well, though they may struggle with extremely niche domain terms compared to Yandex.7  
* **Chinese (zh-CN):** The voice XiaoxiaoNeural is widely regarded as one of the best standard Mandarin voices available. It supports multiple speaking styles (newscast, customer service, lyrical), which allows for tonal variety in lessons. Timestamps are provided at the character (Hanzi) level, which is the correct semantic unit for Chinese.7  
* **Arabic (ar-SA/EG):** Azure supports Modern Standard Arabic (MSA) and specific regional dialects. The timestamping handles the RTL (Right-to-Left) flow logically (providing temporal start/end), leaving the visual rendering engine to handle the spatial placement.  
* **Japanese (ja-JP):** Reliable pitch accent handling. Voices like Nanami and Keita are standard for Japanese e-learning.

Reliability & Scale:  
Azure offers a 99.9% SLA. The "connection issues" noted in the user context are frequently due to WebSocket timeouts in strict firewall environments or aggressive keep-alive settings. Switching to the REST API for batch processing (generating the file and timestamps in one go rather than streaming) eliminates this instability for non-real-time video rendering pipelines.8

### **3.2 Amazon Polly (The Reliable Runner-Up)**

Amazon Polly remains a strong contender, particularly for teams already entrenched in the AWS ecosystem.

Timestamp Implementation:  
Polly uses "Speech Marks." To get timestamps, one must make a separate API call (or a specific request type) that returns a stream of JSON objects describing the start/end of sentences, words, and visemes.

* **Mechanism:** You request SpeechMarkTypes=\['word', 'viseme'\]. The audio stream and the speech mark stream are separate, requiring the developer to merge them.  
* **SSML Reliance:** Polly relies heavily on SSML for fine-grained control. While powerful, this adds complexity to the text pre-processing stage.

**Language Support:**

* **Quality:** Polly's "Neural" voices are excellent but are beginning to sound slightly "last-generation" compared to the emotive capabilities of ElevenLabs or Azure's newer HD voices.  
* **Coverage:** It fully supports all 6 core languages. The Russian and Chinese voices are competent but lack the "Breath" and "Micro-prosody" that make newer models sound indistinguishable from humans.9

Pricing:  
Polly follows the industry standard of \~$16.00 per 1 million characters for Neural voices. This price parity with Azure makes the choice largely a matter of feature set and voice preference rather than cost.11

### **3.3 Google Cloud TTS (The Metadata Complex)**

Google Cloud offers high-quality "WaveNet" and "Neural2" voices but suffers from a more cumbersome implementation of timestamps.

Timestamp Implementation:  
Google uses "Timepoints." To get a timestamp, the user often has to explicitly insert \<mark name="point\_1"/\> tags into the SSML at the locations they want to track.12 While they have added enableWordTimeOffsets to the configuration, the granularity and ease of use lag behind Azure's automatic event stream. The necessity to potentially pre-parse text to insert marks at every word boundary to emulate Azure's functionality is a significant engineering overhead.  
Language Quality:  
Google's strength lies in its massive language coverage and the "Studio" voices, which are very high quality. However, the pricing for Studio voices is significantly higher ($160/1M chars), pushing it out of the competitive range for high-volume automated video generation compared to Azure's $16/1M chars.14

## ---

**4\. Detailed Provider Analysis: The AI Natives**

The AI-native companies operate on a different paradigm: "Audio First." They prioritize the listening experience, often treating metadata as a secondary feature. However, this is shifting rapidly.

### **4.1 ElevenLabs (The Quality Benchmark)**

ElevenLabs is the current market leader in voice realism. For an educational pipeline, this "naturalness" translates to higher learner engagement and retention.

Timestamp Implementation:  
ElevenLabs initially launched without timestamps but has since introduced a robust alignment feature in their v2 models.

* **API:** The response includes an alignment object with characters, character\_start\_times\_seconds, and character\_end\_times\_seconds.15  
* **The "Re-assembly" Challenge:** Unlike Azure, which gives you "Words", ElevenLabs gives you "Characters." To synchronize a slide transition at the word "Python," your code must aggregate the durations of 'P', 'y', 't', 'h', 'o', 'n' and the subsequent space. This requires a robust client-side tokenizer that matches the TTS engine's normalization rules. This is particularly complex for languages like Chinese (where characters are words but phrase boundaries matter) and Japanese (where kanji expands to multiple moras).  
* **Japanese Caveat:** Documentation explicitly notes that applying text normalization for Japanese can increase latency and complexity in alignment, necessitating careful handling of the apply\_language\_text\_normalization parameter.15

**Language Support:**

* **Multilingual v2:** A single "Super-model" handles all languages. This is a massive architectural advantage—you don't need to switch endpoints or voice IDs based on the text language. It detects and switches automatically.  
* **Russian:** Exceptional. It captures the "melancholic" or "authoritative" undertones of Russian prosody better than any cloud provider.  
* **Chinese:** Very strong, though it can sometimes drift into an "accented" delivery if the prompt is short or lacks context.

Pricing:  
This is the primary friction point. ElevenLabs' pricing is tiered. At the "Business" scale, costs can effectively be $100+ per 1 million characters, nearly 6-10x the cost of Azure. For 5,000 lessons/month, this premium must be justified by the "Premium" nature of the content.16

### **4.2 Deepgram Aura (The Efficiency Specialist)**

Deepgram has pivoted from being an STT leader to a TTS contender with "Aura." Their architecture is built for speed and throughput.

Timestamp Implementation:  
Leveraging their expertise in ASR timestamps, Deepgram's TTS provides native timing data that is accurate and easy to parse.

* **Performance:** It is designed for real-time agents, meaning its "Time-to-First-Byte" is sub-200ms. For batch video generation, this raw speed translates to faster render times for the entire pipeline.17

**Language Support:**

* **Status:** Deepgram is rapidly expanding. As of late 2024, they have added "Anglosphere" accents and are rolling out Spanish, French, and others.  
* **Critical Gap:** Support for **Russian** and **Arabic** in the Aura TTS model needs verification for production readiness. While their STT covers these, TTS models often lag. Current documentation highlights English and Spanish as the primary polished models for Aura.18 Using Deepgram for English/Spanish and Yandex for Russian might be a necessary hybrid strategy.

Pricing:  
Deepgram is aggressively priced (\~$15/1M chars), often undercutting the hyperscalers on volume deals.

### **4.3 Cartesia (Sonic)**

Cartesia uses State Space Models (SSMs) instead of Transformers, offering a different efficiency curve.

Timestamp Implementation:  
Timestamps are supported, but heavily segmented by model version. The sonic-preview model supports timestamps for all languages, but the stable sonic model restricts timestamps to English, German, Spanish, and French.19 This reliance on a "Preview" model for core languages like Russian and Chinese introduces a stability risk for a production pipeline that demands 99% uptime.

## ---

**5\. Regional Specialists: Filling the Quality Gaps**

For a global pipeline, "Generic" models sometimes fail on specific cultural nuances.

### **5.1 Yandex SpeechKit (The Russian Standard)**

If the Russian market is primary, Yandex is indispensable. Russian is a stress-timed language where moving the stress (ударение) can change a word's meaning (e.g., "замок" \- castle vs. lock).

* **Capability:** Yandex SpeechKit is trained on the vast corpus of the Russian internet. It handles slang, technical jargon, and stress placement with native-level accuracy that Azure and Polly sometimes miss.  
* **Integration:** It offers both REST and gRPC APIs. Timestamps are available but require specific configuration in the v3 API.20  
* **Recommendation:** If the "Russian Technical Lesson" scenario fails on Azure (i.e., sounds too "Americanized"), Yandex is the fail-safe.

### **5.2 Tencent Cloud / MiniMax (The Chinese Standard)**

* **Tencent Cloud TTS:** Delivers broadcast-quality Mandarin with perfect tonal handling. However, integrating a China-hosted API into a western pipeline involves latency across the Great Firewall and payment complexity.  
* **MiniMax:** An emerging powerhouse in generative voice for Chinese. It offers timestamps but, like Tencent, presents integration hurdles regarding data sovereignty and payment rails for non-Chinese entities.21

## ---

**6\. Strategic Analysis: Navigating the Trade-offs**

The decision matrix for this pipeline is not linear; it is a triangulation of three competing constraints.

### **6.1 The Trilemma of TTS Selection**

Strategic decision-making in this domain involves balancing **Quality**, **Control**, and **Cost**.

* **Quality:** How "human" and "engaging" is the voice? (ElevenLabs leads).  
* **Control:** How precise and reliable is the metadata (timestamps, visemes)? (Azure leads).  
* **Cost:** How sustainable is the opex at scale? (Deepgram/Azure lead).

Azure sits at the "balanced center," offering high control, good quality, and moderate cost. ElevenLabs occupies the "Premium" corner, maximizing quality at the expense of cost. Deepgram occupies the "Efficiency" corner, maximizing speed and cost but currently lacking the linguistic breadth of Azure for the specific 6-language requirement.

### **6.2 Timestamp Support Matrix**

![][image1]

The heatmap above underscores Azure's dominance in "Stable" support across the board. While ElevenLabs covers the languages, the integration burden of character-level reassembly puts it slightly behind in "Control." Cartesia's reliance on "Preview" models for Russian and Chinese makes it risky for immediate production use.

## ---

**7\. Commercial Analysis: The Cost of Scale**

Cost modeling is critical when scaling from 500 to 5,000 lessons. Assuming an average lesson length of 20,000 characters (approx. 15-20 minutes of speech), the monthly throughput moves from 10 Million to 100 Million characters.

### **7.1 Cost Projections**

| Provider | Model | $/1M Chars | Monthly Cost (Scale A: 10M) | Monthly Cost (Scale B: 100M) | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Google Cloud** | Standard | $4.00 | $40 | $400 | "Standard" voices are robotic/legacy. |
| **Google Cloud** | WaveNet | $16.00 | $160 | $1,600 | Good quality, standard cloud pricing. |
| **Azure** | Neural | $16.00 | $160 | $1,600 | **Best Value/Quality Ratio.** Enterprise discounts apply. |
| **Amazon Polly** | Neural | $16.00 | $160 | $1,600 | Identical pricing structure to Azure. |
| **Deepgram** | Aura | $15.00 | $150 | $1,500 | Volume discounts available for committed use. |
| **ElevenLabs** | Creator/Pro | \~$200.00\* | \~$2,000 | \~$20,000 | *Based on standard credit packs. Enterprise negotiation required.* |
| **OpenAI** | TTS-1 | $15.00 | $150 | $1,500 | *Hidden Cost:* \+$6.00/1M for ASR alignment (Whisper). |

![][image2]

Analysis:  
The visual data confirms a stark reality: at 5,000 lessons per month, ElevenLabs is likely cost-prohibitive for a standard e-learning business model unless the content commands a premium price point. Azure and Deepgram represent the sustainable operational choice. The "Hidden Cost" of OpenAI is also notable: if you use OpenAI TTS ($15) and then have to run Whisper ($6) to get timestamps, your effective cost is $21, with added latency and drift risk.

## ---

**8\. Integration & Implementation Roadmap**

Implementing a time-synchronized pipeline requires handling the specific data structures returned by the providers.

### **8.1 The "Sync Engine" Logic**

To achieve the "Critical Requirement" of timestamps, your pipeline code must implement a normalization layer that abstracts the provider-specific formats into a common "Sync Map" for your video renderer.

Azure's WordBoundary Format:  
Azure provides a stream of events. The critical implementation detail is the unit conversion.

JSON

{  
  "AudioOffset": 12300000,  
  "Duration": 5000000,  
  "Text": "Welcome"  
}

* *Engineering Note:* AudioOffset is in ticks. You must divide by 10,000 to get milliseconds. This offset is perfectly aligned with the audio stream.

ElevenLabs Character Format:  
ElevenLabs returns parallel arrays.

JSON

{  
  "characters": \["H", "e", "l", "l", "o", " "\],  
  "character\_start\_times\_seconds": \[0.0, 0.1, 0.15, 0.2, 0.25, 0.3\],  
  "character\_end\_times\_seconds": \[0.1, 0.15, 0.2, 0.25, 0.3, 0.35\]  
}

* *Engineering Note:* To get word-level triggers for slides, you must write a reducer function. You iterate through the characters array, aggregating durations until you hit a delimiter (space or punctuation).  
* *Complexity:* This is trivial for English ("Hello World") but complex for Chinese ("你好世界") where there are no spaces. For Chinese, you would map 1 Character \= 1 Word/Syllable directly. For Japanese, you must be careful with the normalization settings to ensuring the characters in the array match your script exactly.

### **8.2 Recommended Architecture: The Hybrid Approach**

Given the cost and quality trade-offs, the most sophisticated architecture is a **Hybrid Routing System**.

1. **Tier 1: "Hero" Content (Intros, Summaries):** Use **ElevenLabs**. The volume is low (5% of total characters), so the cost is manageable. The high emotional quality hooks the learner.  
2. **Tier 2: "Core" Content (Technical Deep Dives):** Use **Azure AI Speech**. The volume is high (95% of total). The "neutral" tone of Azure is actually often better for technical explanations as it is less distracting than a hyper-emotive AI voice. The timestamps are rock-solid for synchronizing code highlighting.  
3. **Tier 3: Specialized Locales:** Use **Yandex** specifically for Russian if user feedback indicates Azure's Russian is insufficient.

## ---

**9\. Final Recommendation**

![][image3]

### **Best Overall: Microsoft Azure AI Speech**

**Rationale:** Azure is the only provider that satisfies the "Must Have" requirements for **native timestamps**, **6-language support**, and **production stability** without requiring complex workarounds. Its timestamp implementation (WordBoundary) is the industry benchmark for precision. The voice quality for Chinese (Xiaoxiao) and English (Jenny) is excellent. While "connection issues" were noted in your context, these are solvable by using the REST API for batch processing rather than the streaming SDK. At **$16/1M characters**, it fits the unit economics of a 5,000-lesson/month pipeline perfectly.

### **Best Quality (Premium): ElevenLabs**

**Rationale:** If the business model supports the 10x cost premium, ElevenLabs offers an unmatched listening experience. It is the "Apple" option: expensive, beautiful, but with a more closed ecosystem. It is the recommended choice *only* if you have the engineering resources to build the character-to-word timestamp aggregator and the budget to sustain \~$20k/month at scale.

### **Best Budget / High Throughput: Deepgram Aura**

**Rationale:** Deepgram is the "Speed" option. If the pipeline eventually scales to 50,000 lessons/month, Deepgram's lower cost and faster processing become critical. However, immediate adoption requires validating the Russian and Arabic voice quality, which are newer additions to their stack compared to Azure's mature catalog.

### **Best for Russian: Yandex SpeechKit**

**Rationale:** For a pipeline heavily weighted towards the Russian market, Yandex remains the gold standard for linguistic accuracy. It should be considered as a "plugin" specifically for ru-RU generation if Azure's Russian voices do not meet the bar for native listeners.

In conclusion, for a robust, automated pipeline being built in 2024-2025, **Microsoft Azure** provides the safest, most feature-complete foundation. It offers the metadata you need to drive your video engine today, with a quality level that is sufficient for 95% of educational use cases. Start with Azure, and consider "upgrading" specific high-value segments to ElevenLabs as your revenue scales.

#### **Источники**

1. Which API has the feature of getting the timestamps of words in the generated speech? : r/TextToSpeech \- Reddit, дата последнего обращения: декабря 24, 2025, [https://www.reddit.com/r/TextToSpeech/comments/1c5gmgw/which\_api\_has\_the\_feature\_of\_getting\_the/](https://www.reddit.com/r/TextToSpeech/comments/1c5gmgw/which_api_has_the_feature_of_getting_the/)  
2. Timestamped Captions for TTS API \[Feature Request\] \- OpenAI Developer Community, дата последнего обращения: декабря 24, 2025, [https://community.openai.com/t/timestamped-captions-for-tts-api-feature-request/538339](https://community.openai.com/t/timestamped-captions-for-tts-api-feature-request/538339)  
3. New Audio Model Snapshots in the Realtime-API \- OpenAI Developer Community, дата последнего обращения: декабря 24, 2025, [https://community.openai.com/t/new-audio-model-snapshots-in-the-realtime-api/1369374](https://community.openai.com/t/new-audio-model-snapshots-in-the-realtime-api/1369374)  
4. Get facial position with viseme \- Foundry Tools | Microsoft Learn, дата последнего обращения: декабря 24, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)  
5. Voice and sound with Speech Synthesis Markup Language (SSML) \- Microsoft Learn, дата последнего обращения: декабря 24, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice)  
6. What are OpenAI text to speech voices? \- Foundry Tools \- Microsoft Learn, дата последнего обращения: декабря 24, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/openai-voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/openai-voices)  
7. Language support \- Speech service \- Foundry Tools \- Microsoft Learn, дата последнего обращения: декабря 24, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)  
8. Azure Speech in Foundry Tools pricing, дата последнего обращения: декабря 24, 2025, [https://azure.microsoft.com/en-ca/pricing/details/cognitive-services/speech-services/](https://azure.microsoft.com/en-ca/pricing/details/cognitive-services/speech-services/)  
9. Languages in Amazon Polly, дата последнего обращения: декабря 24, 2025, [https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html](https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html)  
10. Available voices \- Amazon Polly \- AWS Documentation, дата последнего обращения: декабря 24, 2025, [https://docs.aws.amazon.com/polly/latest/dg/available-voices.html](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html)  
11. Amazon Polly Pricing \- AWS, дата последнего обращения: декабря 24, 2025, [https://aws.amazon.com/polly/pricing/](https://aws.amazon.com/polly/pricing/)  
12. Speech Synthesis Markup Language (SSML) \- Google Cloud Documentation, дата последнего обращения: декабря 24, 2025, [https://docs.cloud.google.com/text-to-speech/docs/ssml](https://docs.cloud.google.com/text-to-speech/docs/ssml)  
13. Google Cloud Text-to-speech word timestamps \- Stack Overflow, дата последнего обращения: декабря 24, 2025, [https://stackoverflow.com/questions/55320826/google-cloud-text-to-speech-word-timestamps](https://stackoverflow.com/questions/55320826/google-cloud-text-to-speech-word-timestamps)  
14. Review pricing for Text-to-Speech | Google Cloud, дата последнего обращения: декабря 24, 2025, [https://cloud.google.com/text-to-speech/pricing](https://cloud.google.com/text-to-speech/pricing)  
15. Create speech with timing | ElevenLabs Documentation, дата последнего обращения: декабря 24, 2025, [https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)  
16. ElevenLabs API Pricing — Build AI Audio Into Your Product, дата последнего обращения: декабря 24, 2025, [https://elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api)  
17. Text-to-Speech | Deepgram's Docs, дата последнего обращения: декабря 24, 2025, [https://developers.deepgram.com/changelog/text-to-speech-changelog](https://developers.deepgram.com/changelog/text-to-speech-changelog)  
18. Voices and Languages | Deepgram's Docs, дата последнего обращения: декабря 24, 2025, [https://developers.deepgram.com/docs/tts-models](https://developers.deepgram.com/docs/tts-models)  
19. Compare TTS Endpoints \- Cartesia Docs, дата последнего обращения: декабря 24, 2025, [https://docs.cartesia.ai/api-reference/tts/compare-tts-endpoints](https://docs.cartesia.ai/api-reference/tts/compare-tts-endpoints)  
20. Speech synthesis | Yandex Cloud \- Documentation, дата последнего обращения: декабря 24, 2025, [https://yandex.cloud/en/docs/speechkit/tts/](https://yandex.cloud/en/docs/speechkit/tts/)  
21. Async Long TTS Guide \- MiniMax API Docs, дата последнего обращения: декабря 24, 2025, [https://platform.minimax.io/docs/guides/speech-t2a-async](https://platform.minimax.io/docs/guides/speech-t2a-async)  
22. Best Minimax Speech 2.6 Turbo API Pricing & Speed \- WaveSpeedAI, дата последнего обращения: декабря 24, 2025, [https://wavespeed.ai/docs-api/minimax/minimax-speech-2.6-turbo](https://wavespeed.ai/docs-api/minimax/minimax-speech-2.6-turbo)