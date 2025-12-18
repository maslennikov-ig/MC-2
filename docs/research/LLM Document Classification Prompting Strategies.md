# **Architectural & Cognitive Strategies for Mitigating Classification Bias in Educational Course Generation: A Comprehensive Analysis**

## **1\. Introduction**

The automated curation of educational content represents one of the most sophisticated challenges in the application of Large Language Models (LLMs). The task of transforming a heterogeneous corpus of uploaded documents—ranging from unstructured PDFs and lecture slides to dense academic textbooks—into a coherent, structured course requires a classification capability that transcends simple keyword matching. The specific objective of distinguishing between **CORE** (foundational, mandatory materials), **IMPORTANT** (significant supporting evidence), and **SUPPLEMENTARY** (peripheral enrichment) is not merely a sorting exercise; it is a pedagogical judgment that defines the learning pathway for the student.

However, current implementations of this pipeline frequently encounter a persistent and systemic failure mode: a pronounced bias toward the "SUPPLEMENTARY" classification. This phenomenon, where the model consistently downgrades the priority of documents in the absence of overwhelming evidence to the contrary, is not a trivial error of calibration. Rather, it is an emergent property of the safety-aligned, reinforcement-learned architectures of modern foundation models.

When an LLM—trained to be "helpful, harmless, and honest"—encounters a document with ambiguous utility, its internal probability distribution favors the path of least resistance. In the context of curriculum generation, classifying a document as "CORE" is an assertive, high-stakes claim. It implies that the document is essential for success, that it contains the structural "truth" of the course, and that its exclusion would compromise the integrity of the learning module. Conversely, classifying a document as "SUPPLEMENTARY" is a passive, low-stakes claim. It suggests relevance without necessity. For a model optimized to minimize hallucination and avoid taking controversial stances on "truth," the "SUPPLEMENTARY" label acts as a semantic safety valve—a "catch-all" basin of attraction that captures any input that does not explicitly scream its own importance.

This report provides an exhaustive, expert-level analysis of this classification bias and delineates a rigorous methodology for overcoming it. We will explore the cognitive architectures of LLMs that drive this behavior, compare the mathematical efficacy of Pointwise versus Listwise ranking strategies, and provide detailed, research-backed prompt engineering frameworks designed to force the model out of its neutral stance and into the decisive role of an expert curriculum designer. By synthesizing insights from recent studies on bias mitigation 1, ranking algorithms 3, and educational taxonomy 5, we establish a new standard for priority classification in AI-driven EdTech platforms.

## **2\. The Cognitive Architecture of Classification Bias**

To effectively engineer a solution, one must first deconstruct the underlying mechanisms that compel an LLM to default to the "SUPPLEMENTARY" class. This bias is not a superficial preference but a deep-seated behavioral trait resulting from the interaction between pre-training data distributions and post-training alignment strategies.

### **2.1 The Safety-Neutrality Alignment Paradox**

Modern Large Language Models undergo extensive Reinforcement Learning from Human Feedback (RLHF) to align their outputs with human values. A primary directive of this alignment is "political even-handedness" and the avoidance of bias toward any particular ideological position.7 While this is intended to prevent the model from generating harmful or opinionated content in social contexts, it creates a "safe-class bias" when applied to technical classification tasks.

In an educational taxonomy, the distinction between "CORE" and "SUPPLEMENTARY" often mirrors the distinction between "definitive truth" and "additional context." A "CORE" document, such as a syllabus, defines the reality of the course—the grading schema, the schedule, and the mandatory learning objectives. It is the legislative branch of the course structure. A "SUPPLEMENTARY" document is merely supportive. When a model processes a text that is dense, complex, or slightly ambiguous, its safety training discourages it from making the "strong" claim that this document is the definitive authority (CORE).1 Instead, it retreats to the "weaker" claim that the document is simply relevant (SUPPLEMENTARY).

Research indicates that even when models pass explicit social bias tests, they harbor pervasive implicit biases that manifest in their decision-making behaviors.1 In the context of document sorting, this manifests as a reluctance to elevate a document to the highest tier of importance unless the text contains explicit, undeniable markers (e.g., the word "Syllabus" in the header). If the "CORE" nature of the document is implicit—derived from the tone, the structure, or the density of the content—the model's "neutrality" filter dampens the confidence score, pushing the classification below the threshold for "CORE" and into the "SUPPLEMENTARY" bucket.7

### **2.2 The "Supplementary Sink" and Probability Distributions**

In standard classification tasks, the "catch-all" class—the category defined as "everything else"—typically exerts a gravitational pull on the model's predictions. In the user's taxonomy, "SUPPLEMENTARY" is the catch-all.

* **CORE** is narrowly defined (Syllabus, Textbook, Schedule).  
* **IMPORTANT** is narrowly defined (Key Readings, Assignments).  
* **SUPPLEMENTARY** is broadly defined (Everything relevant but not critical).

Probabilistically, the semantic space occupied by "SUPPLEMENTARY" is vastly larger than the space occupied by "CORE." During pre-training, the model has seen billions of documents. The vast majority of these were "supplementary" in nature—news articles, blog posts, encyclopedia entries—rather than "core" syllabi or structural manifestos.9 Consequently, the model's Bayesian prior is heavily weighted toward the supplementary class.

When the prompt asks the model to classify a document, the model calculates the conditional probability $P(Class | Document)$. If the specific features of "CORE" (e.g., "Grading Policy") are present but weak, the massive prior probability of the "SUPPLEMENTARY" class ($P(Supplementary)$) overwhelms the likelihood function, resulting in a misclassification.10 This is known as the **Base Rate Fallacy** in AI: the model ignores the specific evidence in the document in favor of the general prevalence of the class in its training data.

### **2.3 Overgeneralization and the Loss of Granularity**

A related phenomenon is the tendency of LLMs to overgeneralize scientific and technical content. Research testing prominent models like GPT-4 and Claude 3 has shown that LLMs often strip away the nuanced details that limit the scope of a text, producing summaries that are broader and more generalized than the original.12

In course generation, the distinction between "CORE" and "IMPORTANT" often relies on specific, granular details.

* A "CORE" document might say: *"This chapter must be read by Tuesday for the Midterm."*  
* An "IMPORTANT" document might say: *"This chapter covers the history of the concept."*

If the LLM overgeneralizes both of these to *"This chapter discusses the concept,"* the distinction is lost. The specific imperative ("must be read for Midterm") is the signal for "CORE." If the model's summarization or internal representation smoothes over this imperative detail in favor of a general topic summary, the document loses its "CORE" status and drifts into "SUPPLEMENTARY".12 This suggests that prompting strategies must explicitly penalize overgeneralization and demand the extraction of "imperative signals" (dates, deadlines, grading requirements) before classification occurs.

## **3\. Theoretical Frameworks for Document Ranking**

The default approach for many developers is **Pointwise Classification**, where the model evaluates one document at a time. However, the bias toward "SUPPLEMENTARY" is structurally inherent to this method. To solve it, we must shift to architectures that force **Relative Comparison**.

### **3.1 The Failure of Pointwise Classification**

In Pointwise classification, the prompt is:

"Classify this document:"

The model looks at the document in isolation. As discussed, without a reference point, the model's internal calibration defaults to "Safe/Supplementary." The model has no way of knowing if this document is the *most* important document in the set or the *least* important. It effectively tries to predict an absolute value for a variable that is inherently relative.3

Furthermore, Pointwise approaches are highly susceptible to **calibration drift**. If the model is slightly "lazy" or "conservative" on a given day (due to temperature settings or stochasticity), the threshold for "CORE" might effectively rise, causing even legitimate syllabi to be missed.14

### **3.2 Listwise Prompting: Forcing a Hierarchy**

**Listwise Prompting** fundamentally changes the cognitive task. Instead of asking "What is this?", we ask "Rank these."

"Here are summaries of 10 documents. Rank them in order of importance to the course curriculum."

By presenting the documents together, we force the model to identify the *local maxima* of importance. Even if the model thinks *all* the documents are relatively weak, it is still forced to place *one* of them at the top of the list.3

* **Mechanism:** The presence of a clearly "SUPPLEMENTARY" document (e.g., a short news clipping) in the list acts as a "contrastive anchor" for the "CORE" document (e.g., a syllabus). The contrast makes the "CORE" features (structure, rules, comprehensive scope) pop out significantly more than they would in isolation.13  
* **Bias Mitigation:** Listwise ranking directly attacks the "Supplementary Sink" problem. The model cannot label everything as "Supplementary" if it is forced to produce a ranked list. The top item in the list is, by definition, the core of that specific batch.  
* **Implementation:** While we cannot feed 100 full documents into the context window, we can use a two-step process:  
  1. **Summarization:** Generate dense, structure-aware summaries of all documents.  
  2. **Listwise Ranking:** Feed batches of 10-20 summaries to the LLM for ranking.16

### **3.3 Setwise Prompting: The Optimal Middle Ground**

**Setwise Prompting** is a recent innovation that balances the efficiency of Pointwise with the accuracy of Listwise.4

* **Method:** The model is presented with a set of documents (e.g., a batch of 5\) and asked to identify the "CORE" documents within that set.  
* **Instruction:** "Identify the single most important document in this set, or state if none are core."  
* **Advantages:**  
  * **Contextual Calibration:** The model calibrates its "CORE" threshold based on the *current* batch.  
  * **Efficiency:** It requires fewer tokens than full Listwise sorting but offers significantly better accuracy than Pointwise.  
  * **Zero-Shot Effectiveness:** Research shows Setwise approaches achieve state-of-the-art results in zero-shot document ranking tasks, significantly outperforming Pointwise methods that struggle with "safe class" bias.4

### **3.4 Pairwise Prompting: The "Tournament" of Importance**

For the highest possible precision—used perhaps for the final decision between "IMPORTANT" and "CORE"—**Pairwise Prompting** is the gold standard.

* **Method:** "Compare Document A and Document B. Which one is more critical for the student's success?".15  
* **Cognitive Effect:** This reduces the complex classification problem to a binary choice. It is much harder for the model to "hedge" or be "neutral" when forced to choose a winner. If Document A contains the grading policy and Document B does not, the choice is deterministic.  
* **Cost:** This is $O(N \\log N)$ or $O(N^2)$ depending on the sorting algorithm, making it too slow for the initial pass but perfect for **tie-breaking** ambiguous documents.21

### **3.5 Comparative Analysis of Ranking Architectures**

The following table summarizes the trade-offs of these architectures specifically regarding the "Supplementary Bias."

| Architecture | Input Structure | Mechanism of Action | Mitigation of "Supplementary Bias" | Computational Cost | Recommended Usage |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Pointwise** | Single Document | Absolute Classification | **Poor.** High susceptibility to neutral/safe priors. | Low ($O(N)$) | Initial filtering of obvious junk. |
| **Listwise** | List of Docs (All) | Global Ranking | **Excellent.** Forces relative hierarchy; top item must be Core. | High (Context Window limits) | Final prioritization of the "Important" bucket. |
| **Setwise** | Batch of Docs (5-10) | Local Ranking / Selection | **High.** Provides local contrast anchors. | Medium ($O(N/k)$) | **The Primary Classification Driver.** |
| **Pairwise** | Two Docs | Binary Comparison | **Very High.** Binary choice eliminates hedging. | Very High ($O(N^2)$) | Resolving edge cases / Tie-breaking. |

3

## **4\. Prompt Engineering Strategies for Priority Classification**

Having selected the **Setwise** or **Listwise** architecture as the structural foundation, we must now optimize the *content* of the prompt itself. The prompt is the interface through which we manipulate the model's latent space to suppress the "Supplementary" prior.

### **4.1 Chain-of-Thought (CoT) and Reasoning Traces**

The most effective technique for overcoming implicit bias is **Chain-of-Thought (CoT)** prompting.23 The "Supplementary" classification is often a "System 1" (fast, intuitive) response from the LLM. To force "System 2" (slow, deliberative) reasoning, the prompt must demand a step-by-step analysis *before* the final label is assigned.

Why CoT Works for this Use Case:  
When the model simply outputs a label, it is predicting the most likely token following the text. Given the training data imbalance, "Supplementary" is statistically probable. However, if the model is forced to first list the attributes of the document—"This document contains a grading rubric (20%), a weekly schedule, and a list of required textbooks"—the internal state of the model changes. The attention mechanism is now focused on these high-value "CORE" tokens. When it then attempts to generate the label, predicting "Supplementary" would be logically inconsistent with the evidence it just generated. The reasoning trace acts as a "binding commitment" to the evidence.25  
**Implementation:**

**Prompt:** "Do not classify the document immediately. First, extract the following features: 1\. Presence of grading criteria. 2\. Presence of a chronological schedule. 3\. Explicit imperative language (e.g., 'must read').

Then, evaluate the document's indispensability. Could a student pass the course without this document?

Finally, based on this reasoning, assign the class." 26

### **4.2 The "Devil's Advocate" / Contrarian Prompting**

To specifically break the "neutrality" loop, we can use a **Contrarian Prompting** strategy.28 The standard prompt asks, "Is this document Core?" The model, being risk-averse, looks for reasons to say "No."

The Contrarian Prompt reverses this burden of proof:

**Prompt:** "Assume for a moment that this document is the **CORE SYLLABUS** of the course. Search the text for evidence that supports this hypothesis. If you find **any** strong evidence (grading, schedule, rules), you **must** maintain this hypothesis. Only reject it if the evidence is completely absent."

This utilizes the model's confirmation bias to our advantage. By priming the model with the "CORE" hypothesis, we lower the activation threshold for that class. The model is now looking for *confirmation* of Core status rather than *permission* to grant it.29

### **4.3 Structured Output Enforcement (JSON Schema)**

Free-text responses allow the model to "hedge" (e.g., *"This document is important but could be considered supplementary..."*). This ambiguity often collapses into the safer label during parsing. **Structured Output (JSON)** forces the model to commit to a specific, discrete value.30

Furthermore, defining a schema with a confidence\_score and a justification field allows us to detect "unconfident" classifications.

* **Schema Design:**  
  JSON  
  {  
    "is\_syllabus\_candidate": boolean,  
    "contains\_grading\_policy": boolean,  
    "contains\_schedule": boolean,  
    "imperative\_score": number (0-10),  
    "classification": "CORE" | "IMPORTANT" | "SUPPLEMENTARY",  
    "confidence": number (0.0-1.0),  
    "reasoning": "string"  
  }

* **Mechanism:** By forcing the model to explicitly set boolean flags for contains\_grading\_policy *before* setting the classification, we enforce a logical dependency. The model is statistically unlikely to output contains\_grading\_policy: true and then classification: SUPPLEMENTARY in the same JSON object.30

### **4.4 Few-Shot Prompting with Counter-Balanced Examples**

Zero-shot prompting forces the model to rely on its pre-training priors (which favor "Supplementary"). **Few-Shot Prompting** allows us to provide a "local" prior.10

Crucially, the examples provided in the prompt must be **Counter-Balanced**.

* **The Mistake:** Providing 1 Core, 1 Important, and 1 Supplementary example.  
* **The Fix:** Provide **3 Core**, **2 Important**, and **1 Supplementary** example.  
* **Why:** We want to artificially inflate the probability of the "CORE" class in the local context window. We specifically need to show examples of **Edge Cases**—documents that *look* boring (plain text, no images) but are actually CORE (e.g., a simple text file syllabus). Showing the model that "plain text \= CORE" breaks the heuristic that "fancy PDF \= Important" or "plain text \= Supplementary".34

## **5\. Domain-Specific Feature Engineering: The Education Taxonomy**

To prompt effectively, we must speak the language of the domain. "Importance" is vague; "Curricular Centrality" is precise. We must define the classes using the specific ontology of education.5

### **5.1 Defining "CORE": The Structural Skeleton**

A "CORE" document is not just "very important"; it is **Structural**. It defines the ontology of the course itself.

* **Key Features:** Grading Policy, Academic Integrity Statement, Weekly Schedule, Exam Dates, Learning Objectives (Bloom's Taxonomy), "Required Textbooks" list.5  
* **Prompt Keyword Injection:** The prompt should explicitly scan for these terms."Scan for the following Structural Markers: 'Grade Breakdown', 'Schedule', 'Calendar', 'Prerequisites', 'Office Hours'. If 3+ markers are present, the document is likely CORE." 38  
* **Syllabus vs. Study Guide:** A syllabus defines *what* will be learned. A study guide helps *learn* it. The prompt must distinguish between "Rule Setting" (Core) and "Content Review" (Important).40

### **5.2 Defining "IMPORTANT": The Content Vehicles**

"IMPORTANT" documents are the primary vehicles for content delivery. They are mandatory but not structural.

* **Key Features:** "Chapter 1", "Lecture 3", "Assignment 2 Prompt", "Case Study".  
* **Distinction:** These documents contain the *information* tested by the CORE documents.  
* **Prompt Instruction:** "Does this document contain the primary subject matter described in the syllabus? Is it a textbook chapter or a primary lecture deck? If yes, classify as IMPORTANT.".42

### **5.3 Defining "SUPPLEMENTARY": The Enrichment Layer**

"SUPPLEMENTARY" documents are passive. They enrich but do not define.

* **Key Features:** "Further Reading", "Optional", News Articles, External URLs, "Reference Material".  
* **Prompt Instruction:** "Is this document optional? Does it provide context that, if missing, would **not** cause the student to fail? If yes, SUPPLEMENTARY.".5

### **5.4 Metadata Injection: The "Hidden" Signals**

Text alone is often insufficient. **Metadata** provides critical signals that are invisible to the token stream unless explicitly injected.43

* **Filenames:** A file named Syllabus\_Final\_v2.pdf has a massive heuristic weight. A file named reading\_list.txt is likely SUPPLEMENTARY.  
* **Page Count:** A 1-page PDF is rarely a textbook (IMPORTANT) but could be a Syllabus (CORE). A 300-page PDF is likely a Textbook (IMPORTANT) or a collection of readings.  
* **Prompt Strategy:**"METADATA CONTEXT:  
  Filename: '{filename}'  
  Page Count: {page\_count}  
  File Type: {extension}  
  INSTRUCTION: Use the filename as a strong prior. If the filename contains 'Syllabus', start with a 90% confidence that it is CORE and look for disconfirming evidence." 45

## **6\. Technical Implementation of Hybrid RAG Systems**

To solve the bias permanently, we must move beyond classifying documents in a vacuum. We need a **Systemic Approach** that uses retrieval to anchor classifications.47

### **6.1 The "Syllabus Anchor" Technique**

The most robust way to classify a document as "IMPORTANT" (and not Supplementary) is to find it listed in the Syllabus.

1. **Phase 1: Identify the Syllabus.** Use Setwise prompting to scan all uploads and identify the single "Syllabus" document with the highest confidence.  
2. **Phase 2: The Anchor Check.** Once the Syllabus is found, extract the "Required Reading List" from it.  
3. **Phase 3: Verification.** For every other document, ask:  
   "Does the document '{Current\_Doc\_Title}' appear in the 'Required Reading List' extracted from the Syllabus?  
   * Yes \-\> Classify as **IMPORTANT**.  
   * No \-\> Classify as **SUPPLEMENTARY** (unless it is a Lecture Slide).".49

This transforms the task from *Subjective Classification* (which LLMs struggle with due to bias) to *Objective Verification* (which LLMs excel at). The "Supplementary" bias is bypassed because the existence of the title in the syllabus is an objective fact, not a judgment call.

### **6.2 Hybrid Search Strategies**

When retrieving documents to build the course context, rely on **Hybrid Search**.45

* **Vector Search:** Finds semantically similar content (good for "Important").  
* **Keyword Search (BM25):** Finds exact matches for "Exam", "Syllabus", "Grading" (good for "Core").  
* **Weighting:** Heavily upweight the BM25 scores for the "CORE" classification pass. The word "Syllabus" is a rare, high-information token that should not be diluted by semantic embedding distance.51

## **7\. Calibration and Confidence Management**

Finally, we must deal with the probabilistic nature of the model's output. The "Supplementary" bias is often a "Low Confidence" failure mode—the model isn't *sure* it's Core, so it guesses Supplementary.

### **7.1 Thresholding and Re-Ranking**

We can mathematically adjust the decision boundary.14

* **Standard Logic:** Max(P(Core), P(Imp), P(Supp)).  
* **Biased Logic (Current Problem):** P(Supp) is naturally higher.  
* **Calibrated Logic:** Apply a **Penalty** to the Supplementary class or a **Boost** to the Core class.  
  * Score\_Core \= P(Core) \* 1.5  
  * Score\_Supp \= P(Supp) \* 0.8  
* **Implementation:** If the model predicts "SUPPLEMENTARY" but the confidence score is \< 0.8 (or any tuned threshold), trigger a **Setwise Re-Ranking** pass where this document is compared against a known "IMPORTANT" document to see if it holds up.53

### **7.2 Handling Class Imbalance**

Since the training data (and likely the user's uploads) are imbalanced (1 Syllabus vs. 50 Readings), we must acknowledge this in our evaluation metrics.10

* **Metric:** Do not use Accuracy. Use **Recall on CORE**. It is acceptable to misclassify a Supplementary document as Important (noise), but it is catastrophic to misclassify a Core document as Supplementary (data loss).  
* **Optimization Goal:** Tune the prompts to maximize Recall@Core, even at the expense of Precision.

## **8\. Conclusion**

The bias toward "SUPPLEMENTARY" classification in AI course generation is a predictable artifact of the safety alignment, probability distribution, and lack of context inherent in standard LLM usage. By treating "neutrality" as "safety," models default to the least assertive category.

To rectify this, we must fundamentally restructure the interaction:

1. **Architecture:** Abandon Pointwise prompting in favor of **Setwise** or **Listwise** ranking to force relative comparison.  
2. **Prompt Engineering:** Use **Chain-of-Thought** to enforce reasoning traces, **Structured JSON** to constrain outputs, and **Contrarian Prompting** to utilize confirmation bias.  
3. **Domain Anchoring:** Explicitly define "CORE" using structural educational markers (Grading, Schedule) and use **Metadata** (filenames) as strong priors.  
4. **Systemic Verification:** Use the Syllabus as a "Ground Truth Anchor" to objectively verify the status of other documents via **Hybrid RAG** verification rather than subjective classification.

By implementing this multi-layered strategy, developers can force the LLM to abandon its passive, neutral stance and assume the active, decisive role required for high-fidelity curriculum generation. The "Supplementary Sink" is not an insurmountable wall; it is a probabilistic slope that can be leveled through rigorous, context-aware prompt engineering.

### **9\. Detailed Reference Analysis & Integration**

#### **9.1 The Ranking Algorithms in Detail**

The superiority of Listwise/Setwise approaches is mathematically grounded in the Learning-to-Rank (LTR) literature.3 Pointwise methods approximate $P(y|x)$, while Listwise methods approximate $P(\\pi|X)$, where $\\pi$ is a permutation of the list $X$. The latter captures inter-document dependencies. For a course, the importance of "Lecture 2" depends on the existence of "Lecture 1". Pointwise models miss this; Listwise models capture it.

#### **9.2 The "Safe Class" Psychology**

Snippet 1 and 7 provide the crucial insight that models are "politically even-handed." In a curriculum, "Core" implies a hierarchy of truth. A model aligned to be egalitarian may subtly resist establishing this hierarchy without explicit instruction. The "Contrarian Prompt" 28 specifically counteracts this by explicitly authorizing hierarchical judgment.

#### **9.3 RAG and Metadata**

The use of Hybrid Search (BM25 \+ Vectors) 45 is critical because "Syllabus" is a keyword. Vector embeddings of a syllabus and a detailed summary might be very close in vector space (high cosine similarity), making them hard to distinguish semantically. However, the *word* "Syllabus" appears in one and not the other. BM25 catches this distinction where vectors fail, preventing the Syllabus from being lost in the "Supplementary" semantic cluster.

#### **9.4 Calibration**

Finally, the calibration techniques 14 (Isotonic Regression) allow us to trust the model's confidence scores. By analyzing the *distribution* of confidence scores for the "Supplementary" class, we can identify the "weak" predictions and route them to a secondary "Expert Review" model (perhaps a more expensive, reasoning-heavy model like GPT-4 or Claude 3 Opus) to make the final call, optimizing both cost and accuracy.

#### **Источники**

1. Explicitly unbiased large language models still form biased associations \- PNAS, дата последнего обращения: декабря 2, 2025, [https://www.pnas.org/doi/10.1073/pnas.2416228122](https://www.pnas.org/doi/10.1073/pnas.2416228122)  
2. Bias and Fairness in Large Language Models: A Survey \- MIT Press Direct, дата последнего обращения: декабря 2, 2025, [https://direct.mit.edu/coli/article/50/3/1097/121961/Bias-and-Fairness-in-Large-Language-Models-A](https://direct.mit.edu/coli/article/50/3/1097/121961/Bias-and-Fairness-in-Large-Language-Models-A)  
3. Pointwise vs. Pairwise vs. Listwise Learning to Rank | by Nikhil Dandekar \- Medium, дата последнего обращения: декабря 2, 2025, [https://medium.com/@nikhilbd/pointwise-vs-pairwise-vs-listwise-learning-to-rank-80a8fe8fadfd](https://medium.com/@nikhilbd/pointwise-vs-pairwise-vs-listwise-learning-to-rank-80a8fe8fadfd)  
4. A Setwise Approach for Effective and Highly Efficient Zero-shot Ranking with Large Language Models \- Shengyao Zhuang, дата последнего обращения: декабря 2, 2025, [https://arvinzhuang.github.io/publication/sigir2024Setwise](https://arvinzhuang.github.io/publication/sigir2024Setwise)  
5. Two Markets, One Classroom: How Core and Supplemental Materials Shape Student Learning \- CEMD, дата последнего обращения: декабря 2, 2025, [https://www.cemd.org/two-markets-one-classroom-how-core-and-supplemental-materials-shape-student-learning/](https://www.cemd.org/two-markets-one-classroom-how-core-and-supplemental-materials-shape-student-learning/)  
6. Using Bloom's Taxonomy to Write Effective Learning Objectives, дата последнего обращения: декабря 2, 2025, [https://tips.uark.edu/using-blooms-taxonomy/](https://tips.uark.edu/using-blooms-taxonomy/)  
7. Measuring political bias in Claude \- Anthropic, дата последнего обращения: декабря 2, 2025, [https://www.anthropic.com/news/political-even-handedness](https://www.anthropic.com/news/political-even-handedness)  
8. Follow My Lead: Logical Fallacy Classification with Knowledge-Augmented LLMs \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2510.09970v1](https://arxiv.org/html/2510.09970v1)  
9. Bias in Large Language Models: Origin, Evaluation, and Mitigation \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2411.10915v1](https://arxiv.org/html/2411.10915v1)  
10. Class-imbalanced datasets | Machine Learning \- Google for Developers, дата последнего обращения: декабря 2, 2025, [https://developers.google.com/machine-learning/crash-course/overfitting/imbalanced-datasets](https://developers.google.com/machine-learning/crash-course/overfitting/imbalanced-datasets)  
11. Class Imbalance Strategies — A Visual Guide with Code | by Travis Tang \- Medium, дата последнего обращения: декабря 2, 2025, [https://medium.com/data-science/class-imbalance-strategies-a-visual-guide-with-code-8bc8fae71e1a](https://medium.com/data-science/class-imbalance-strategies-a-visual-guide-with-code-8bc8fae71e1a)  
12. Generalization bias in large language model summarization of scientific research \- NIH, дата последнего обращения: декабря 2, 2025, [https://pmc.ncbi.nlm.nih.gov/articles/PMC12042776/](https://pmc.ncbi.nlm.nih.gov/articles/PMC12042776/)  
13. What are the differences between pointwise, pairwise, and listwise approaches to Learning to Rank? \- Quora, дата последнего обращения: декабря 2, 2025, [https://www.quora.com/What-are-the-differences-between-pointwise-pairwise-and-listwise-approaches-to-Learning-to-Rank](https://www.quora.com/What-are-the-differences-between-pointwise-pairwise-and-listwise-approaches-to-Learning-to-Rank)  
14. Calibrating LLM classification confidences \- Nyckel, дата последнего обращения: декабря 2, 2025, [https://www.nyckel.com/blog/calibrating-gpt-classifications/](https://www.nyckel.com/blog/calibrating-gpt-classifications/)  
15. Large Language Models are Effective Text Rankers with Pairwise Ranking Prompting, дата последнего обращения: декабря 2, 2025, [https://aclanthology.org/2024.findings-naacl.97/](https://aclanthology.org/2024.findings-naacl.97/)  
16. RankVicuna: Zero-Shot Listwise Document Reranking with Open-Source Large Language Models \- Arize AI, дата последнего обращения: декабря 2, 2025, [https://arize.com/blog/rank-vicuna/](https://arize.com/blog/rank-vicuna/)  
17. A Setwise Approach for Effective and Highly Efficient Zero-shot Ranking with Large Language Models | SEO Research Suite \- Online Marketing Consulting, дата последнего обращения: декабря 2, 2025, [https://www.kopp-online-marketing.com/patents-papers/a-setwise-approach-for-effective-and-highly-efficient-zero-shot-ranking-with-large-language-models](https://www.kopp-online-marketing.com/patents-papers/a-setwise-approach-for-effective-and-highly-efficient-zero-shot-ranking-with-large-language-models)  
18. A Setwise Approach for Effective and Highly Efficient Zero-shot Ranking with Large Language Models \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2310.09497v2](https://arxiv.org/html/2310.09497v2)  
19. \[2310.09497\] A Setwise Approach for Effective and Highly Efficient Zero-shot Ranking with Large Language Models \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/abs/2310.09497](https://arxiv.org/abs/2310.09497)  
20. Large Language Models are Effective Text Rankers with Pairwise Ranking Prompting \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/abs/2306.17563](https://arxiv.org/abs/2306.17563)  
21. Ranking Basics: Pointwise, Pairwise, Listwise | Towards Data Science, дата последнего обращения: декабря 2, 2025, [https://towardsdatascience.com/ranking-basics-pointwise-pairwise-listwise-cd5318f86e1b/](https://towardsdatascience.com/ranking-basics-pointwise-pairwise-listwise-cd5318f86e1b/)  
22. Prompt-Based Document Modifications In Ranking Competitions \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2502.07315v1](https://arxiv.org/html/2502.07315v1)  
23. CoT-Driven Framework for Short Text Classification: Enhancing and Transferring Capabilities from Large to Smaller Model \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2401.03158v2](https://arxiv.org/html/2401.03158v2)  
24. Chain-of-Thought Prompting Elicits Reasoning in Large Language Models \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/pdf/2201.11903](https://arxiv.org/pdf/2201.11903)  
25. Large Language Model Prompt Chaining for\\\\Long Legal Document Classification \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/pdf/2308.04138](https://arxiv.org/pdf/2308.04138)  
26. Chain-of-Thought Prompting | Prompt Engineering Guide, дата последнего обращения: декабря 2, 2025, [https://www.promptingguide.ai/techniques/cot](https://www.promptingguide.ai/techniques/cot)  
27. Everyone share their favorite chain of thought prompts\! : r/LocalLLaMA \- Reddit, дата последнего обращения: декабря 2, 2025, [https://www.reddit.com/r/LocalLLaMA/comments/1hf7jd2/everyone\_share\_their\_favorite\_chain\_of\_thought/](https://www.reddit.com/r/LocalLLaMA/comments/1hf7jd2/everyone_share_their_favorite_chain_of_thought/)  
28. Evaluating political bias in LLMs \- Promptfoo, дата последнего обращения: декабря 2, 2025, [https://www.promptfoo.dev/blog/grok-4-political-bias/](https://www.promptfoo.dev/blog/grok-4-political-bias/)  
29. What are the best prompts to learn something effectively with ChatGPT? \- Reddit, дата последнего обращения: декабря 2, 2025, [https://www.reddit.com/r/ChatGPTPromptGenius/comments/1mi5lgd/what\_are\_the\_best\_prompts\_to\_learn\_something/](https://www.reddit.com/r/ChatGPTPromptGenius/comments/1mi5lgd/what_are_the_best_prompts_to_learn_something/)  
30. JSON prompting for LLMs \- IBM Developer, дата последнего обращения: декабря 2, 2025, [https://developer.ibm.com/articles/json-prompting-llms/](https://developer.ibm.com/articles/json-prompting-llms/)  
31. JSON Prompting for LLMs: Structure Prompts, Scale Results | by Rahul Kumar \- Medium, дата последнего обращения: декабря 2, 2025, [https://rk-journal.medium.com/json-prompting-for-llms-structure-prompts-scale-results-a4dc85cb932f](https://rk-journal.medium.com/json-prompting-for-llms-structure-prompts-scale-results-a4dc85cb932f)  
32. Crafting Structured {JSON} Responses: Ensuring Consistent Output from any LLM, дата последнего обращения: декабря 2, 2025, [https://dev.to/rishabdugar/crafting-structured-json-responses-ensuring-consistent-output-from-any-llm-l9h](https://dev.to/rishabdugar/crafting-structured-json-responses-ensuring-consistent-output-from-any-llm-l9h)  
33. EPIC: Effective Prompting for Imbalanced-Class Data Synthesis in Tabular Data Classification via Large Language Models \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2404.12404v4](https://arxiv.org/html/2404.12404v4)  
34. Large Language Models For Text Classification: Case Study And Comprehensive Review, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2501.08457v1](https://arxiv.org/html/2501.08457v1)  
35. Improving Training Dataset Balance with ChatGPT Prompt Engineering \- MDPI, дата последнего обращения: декабря 2, 2025, [https://www.mdpi.com/2079-9292/13/12/2255](https://www.mdpi.com/2079-9292/13/12/2255)  
36. Core vs Supplemental » Quality Content \- SETDA.org, дата последнего обращения: декабря 2, 2025, [https://qualitycontent.setda.org/selection/core-vs-supplemental/](https://qualitycontent.setda.org/selection/core-vs-supplemental/)  
37. Read the Standards \- Common Core State Standards Initiative, дата последнего обращения: декабря 2, 2025, [https://www.thecorestandards.org/read-the-standards/](https://www.thecorestandards.org/read-the-standards/)  
38. Guiding Principles for Quality Textbooks (Revised June 2016\) \- Education Bureau, дата последнего обращения: декабря 2, 2025, [https://www.edb.gov.hk/en/curriculum-development/resource-support/textbook-info/GuidingPrinciples/index.html](https://www.edb.gov.hk/en/curriculum-development/resource-support/textbook-info/GuidingPrinciples/index.html)  
39. Syllabus Templates \- Center for Teaching Excellence | University of South Carolina, дата последнего обращения: декабря 2, 2025, [https://sc.edu/about/offices\_and\_divisions/cte/teaching\_resources/syllabus\_templates/](https://sc.edu/about/offices_and_divisions/cte/teaching_resources/syllabus_templates/)  
40. A Comprehensive Framework for Comparing Textbooks: Insights from the Literature and Experts \- MDPI, дата последнего обращения: декабря 2, 2025, [https://www.mdpi.com/2071-1050/14/11/6940](https://www.mdpi.com/2071-1050/14/11/6940)  
41. (PDF) A Comprehensive Framework for Comparing Textbooks: Insights from the Literature and Experts \- ResearchGate, дата последнего обращения: декабря 2, 2025, [https://www.researchgate.net/publication/361136948\_A\_Comprehensive\_Framework\_for\_Comparing\_Textbooks\_Insights\_from\_the\_Literature\_and\_Experts](https://www.researchgate.net/publication/361136948_A_Comprehensive_Framework_for_Comparing_Textbooks_Insights_from_the_Literature_and_Experts)  
42. Supplemental Materials vs. Comprehensive CTE Curriculum: Which Is Right for You? \- iCEV, дата последнего обращения: декабря 2, 2025, [https://www.icevonline.com/blog/supplemental-materials-vs-comprehensive-curriculum](https://www.icevonline.com/blog/supplemental-materials-vs-comprehensive-curriculum)  
43. How to Use Metadata in RAG for Better Contextual Results | Unstructured, дата последнего обращения: декабря 2, 2025, [https://unstructured.io/insights/how-to-use-metadata-in-rag-for-better-contextual-results?modal=try-for-free](https://unstructured.io/insights/how-to-use-metadata-in-rag-for-better-contextual-results?modal=try-for-free)  
44. Develop a RAG Solution \- Chunk Enrichment Phase \- Azure Architecture Center | Microsoft Learn, дата последнего обращения: декабря 2, 2025, [https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-enrichment-phase](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-enrichment-phase)  
45. Hybrid Search in RAG Pipelines: Why It Matters \- AI Empower Labs, дата последнего обращения: декабря 2, 2025, [https://aiempowerlabs.com/blog/hybrid-search-in-rag-pipelines-why-it-matters](https://aiempowerlabs.com/blog/hybrid-search-in-rag-pipelines-why-it-matters)  
46. Streamline RAG applications with intelligent metadata filtering using Amazon Bedrock, дата последнего обращения: декабря 2, 2025, [https://aws.amazon.com/blogs/machine-learning/streamline-rag-applications-with-intelligent-metadata-filtering-using-amazon-bedrock/](https://aws.amazon.com/blogs/machine-learning/streamline-rag-applications-with-intelligent-metadata-filtering-using-amazon-bedrock/)  
47. Guiding Retrieval using LLM-based Listwise Rankers \- arXiv, дата последнего обращения: декабря 2, 2025, [https://arxiv.org/html/2501.09186v1](https://arxiv.org/html/2501.09186v1)  
48. Using LLM's for Retrieval and Reranking | by Jerry Liu | LlamaIndex Blog | Medium, дата последнего обращения: декабря 2, 2025, [https://medium.com/llamaindex-blog/using-llms-for-retrieval-and-reranking-23cf2d3a14b6](https://medium.com/llamaindex-blog/using-llms-for-retrieval-and-reranking-23cf2d3a14b6)  
49. Best Practices in Syllabus Design \- PMC \- NIH, дата последнего обращения: декабря 2, 2025, [https://pmc.ncbi.nlm.nih.gov/articles/PMC10159546/](https://pmc.ncbi.nlm.nih.gov/articles/PMC10159546/)  
50. Optimizing RAG with Hybrid Search & Reranking | VectorHub by Superlinked, дата последнего обращения: декабря 2, 2025, [https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)  
51. LLM RAG: Improving the retrieval phase with Hybrid Search | EDICOM Careers, дата последнего обращения: декабря 2, 2025, [https://careers.edicomgroup.com/techblog/llm-rag-improving-the-retrieval-phase-with-hybrid-search/](https://careers.edicomgroup.com/techblog/llm-rag-improving-the-retrieval-phase-with-hybrid-search/)  
52. 5 Methods for Calibrating LLM Confidence Scores \- Ghost, дата последнего обращения: декабря 2, 2025, [https://latitude-blog.ghost.io/blog/5-methods-for-calibrating-llm-confidence-scores/](https://latitude-blog.ghost.io/blog/5-methods-for-calibrating-llm-confidence-scores/)  
53. Effective Confidence Calibration and Ensembles in LLM-Powered Classification \- Amazon Science, дата последнего обращения: декабря 2, 2025, [https://assets.amazon.science/9f/8f/5573088f450d840e7b4d4a9ffe3e/label-with-confidence-effective-confidence-calibration-and-ensembles-in-llm-powered-classification.pdf](https://assets.amazon.science/9f/8f/5573088f450d840e7b4d4a9ffe3e/label-with-confidence-effective-confidence-calibration-and-ensembles-in-llm-powered-classification.pdf)  
54. A Calibrated Reflection Approach for Enhancing Confidence Estimation in LLMs \- ACL Anthology, дата последнего обращения: декабря 2, 2025, [https://aclanthology.org/2025.trustnlp-main.26.pdf](https://aclanthology.org/2025.trustnlp-main.26.pdf)