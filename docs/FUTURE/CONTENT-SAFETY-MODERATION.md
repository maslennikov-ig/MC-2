# FUTURE: Content Safety Moderation with OpenAI Moderation API

**Status**: DEFERRED (Post-Stage 6)
**Priority**: Low (safety enhancement, not blocking production)
**Blocking**: None
**Implementation Timeline**: Post-Stage 6
**Related**: specs/008-generation-generation-json/spec.md:12

---

## Context

Система обрабатывает пользовательский контент (course titles, learning outcomes, target audience descriptions) и передаёт его в LLMs для генерации курсов. Существует риск, что пользователь может ввести **потенциально вредный или неуместный контент**:

- Offensive language (оскорбления, hate speech)
- Sexual content (явный сексуальный контент)
- Violence (описания насилия)
- Self-harm (контент о самоповреждении)
- Illegal activities (инструкции по незаконным действиям)
- Spam/scam content (мошеннический контент)

**Текущее поведение**: Контент передаётся в LLM без pre-moderation проверки.

**Предлагаемое решение**: Использовать **OpenAI Moderation API** (бесплатный) для pre-generation проверки с user dispute workflow и admin review queue.

## Rationale (Почему отложено)

**Не блокирует Stage 5 production deployment** по следующим причинам:

1. ✅ **Low Priority Risk**:
   - MegaCampusAI — B2B платформа для корпоративного обучения (не public UGC platform)
   - Пользователи — verified organizations (не anonymous users)
   - Content генерируется для **internal training** (не public courses)
   - Multi-tenant isolation снижает blast radius (контент одного tenant не виден другим)

2. ✅ **LLMs имеют встроенную safety**:
   - OpenRouter models (GPT OSS-20B, OSS-120B, Qwen3-max) имеют встроенные safety filters
   - Google Gemini имеет **очень строгие** safety policies (блокирует harmful content)
   - Если пользователь вводит harmful content, LLM likely откажется генерировать или sanitize output

3. ✅ **Manual moderation пока достаточна**:
   - Stage 5-6: Low volume production (pilot customers)
   - Admin panel позволяет manual review при необходимости
   - Support team может реагировать на reports

4. ⏱️ **Требует дополнительной инфраструктуры**:
   - Integration с OpenAI Moderation API
   - User dispute workflow (форма оспаривания модерации)
   - Admin review queue (панель для review flagged content)
   - Email notifications для пользователей и админов
   - False positive handling (legal content помечено как harmful)

5. 🎯 **Лучше сделать после Stage 6**:
   - Когда платформа стабильна и есть real user data
   - Можем собрать metrics о типах harmful content (если есть)
   - Можем определить thresholds для false positive reduction

## Implementation Plan

### Phase 1: OpenAI Moderation API Integration

**Цель**: Интегрировать бесплатный OpenAI Moderation API для pre-generation проверки

**API Overview**:
- **Endpoint**: `https://api.openai.com/v1/moderations`
- **Cost**: 🆓 **FREE** (unlimited requests)
- **Latency**: ~200-500ms per request
- **Models**: `text-moderation-latest` (automatically updated), `text-moderation-stable` (fixed version)
- **Documentation**: https://platform.openai.com/docs/guides/moderation

**Categories Detected**:
- `sexual` - Sexual content
- `hate` - Hate speech
- `harassment` - Harassment or bullying
- `self-harm` - Self-harm content
- `sexual/minors` - Sexual content involving minors (CRITICAL)
- `hate/threatening` - Hateful content that also includes violence or serious harm
- `violence/graphic` - Graphic violence
- `self-harm/intent` - Content where speaker expresses intent to self-harm
- `self-harm/instructions` - Content that encourages self-harm
- `harassment/threatening` - Harassment content that also includes violence or serious harm
- `violence` - Violence

**Response Format**:
```json
{
  "id": "modr-ABC123",
  "model": "text-moderation-007",
  "results": [
    {
      "flagged": true,
      "categories": {
        "sexual": false,
        "hate": true,
        "harassment": false,
        ...
      },
      "category_scores": {
        "sexual": 0.0001,
        "hate": 0.9234,
        "harassment": 0.0234,
        ...
      }
    }
  ]
}
```

**Tasks**:
- [ ] **packages/course-gen-platform/src/services/moderation/openai-moderation.ts**:
  ```typescript
  import OpenAI from 'openai';

  export class OpenAIModerationService {
    private client: OpenAI;

    async moderateContent(text: string): Promise<ModerationResult> {
      const response = await this.client.moderations.create({
        input: text,
        model: 'text-moderation-latest'
      });

      const result = response.results[0];
      return {
        flagged: result.flagged,
        categories: result.categories,
        scores: result.category_scores,
        threshold_exceeded: this.checkThresholds(result)
      };
    }

    private checkThresholds(result: any): string[] {
      // CRITICAL categories: block immediately
      const critical = ['sexual/minors', 'self-harm/intent', 'violence/graphic'];

      // HIGH priority: block if score > 0.7
      const high = ['hate/threatening', 'harassment/threatening'];

      // MEDIUM priority: block if score > 0.85
      const medium = ['sexual', 'hate', 'violence', 'harassment'];

      const exceeded: string[] = [];

      for (const [category, flagged] of Object.entries(result.categories)) {
        if (critical.includes(category) && flagged) {
          exceeded.push(category);
        } else if (high.includes(category) && result.category_scores[category] > 0.7) {
          exceeded.push(category);
        } else if (medium.includes(category) && result.category_scores[category] > 0.85) {
          exceeded.push(category);
        }
      }

      return exceeded;
    }
  }
  ```

- [ ] **Environment Variable**: Добавить `OPENAI_API_KEY` в `.env.local` (тот же ключ, что для embeddings, если используется)

- [ ] **Database Migration**: `20250615000000_add_moderation_results.sql`
  ```sql
  CREATE TABLE content_moderation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    organization_id UUID REFERENCES organizations(id),
    moderation_type TEXT NOT NULL, -- 'course_title', 'learning_outcomes', 'target_audience'
    original_text TEXT NOT NULL,
    flagged BOOLEAN NOT NULL,
    categories JSONB NOT NULL, -- OpenAI categories object
    category_scores JSONB NOT NULL, -- OpenAI scores object
    threshold_exceeded TEXT[], -- List of categories that exceeded thresholds
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'disputed'
    admin_review_notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_moderation_status ON content_moderation_results(status);
  CREATE INDEX idx_moderation_course ON content_moderation_results(course_id);
  CREATE INDEX idx_moderation_flagged ON content_moderation_results(flagged) WHERE flagged = true;
  ```

### Phase 2: Pre-Generation Moderation Workflow

**Цель**: Интегрировать moderation в generation pipeline

**Integration Points**:
1. **Course Creation** (перед Stage 4 Analyze)
2. **Course Edit** (при изменении title/outcomes/audience)
3. **File Upload** (при загрузке документов с текстовым содержимым — опционально)

**Workflow**:
```
User submits course →
  ↓
Check Moderation (OpenAI API) →
  ↓
IF flagged = false → Proceed to Analyze Stage ✅
  ↓
IF flagged = true →
  - Log to content_moderation_results table
  - Return 400 Bad Request with error message
  - Show user-friendly error: "Контент нарушает правила платформы"
  - Offer dispute option
```

**Tasks**:
- [ ] **packages/course-gen-platform/src/server/routers/generation.ts**:
  ```typescript
  router.mutation('createCourse', {
    input: CreateCourseInputSchema,
    async resolve({ input, ctx }) {
      // Step 1: Moderate user input
      const moderationService = new OpenAIModerationService();

      const textsToModerate = [
        { type: 'course_title', text: input.course_title },
        { type: 'learning_outcomes', text: input.learning_outcomes?.join(', ') || '' },
        { type: 'target_audience', text: input.target_audience || '' }
      ];

      for (const item of textsToModerate) {
        if (!item.text) continue;

        const result = await moderationService.moderateContent(item.text);

        if (result.threshold_exceeded.length > 0) {
          // Log to database
          await ctx.db.insert('content_moderation_results', {
            course_id: null, // Not created yet
            user_id: ctx.user.id,
            organization_id: ctx.user.organization_id,
            moderation_type: item.type,
            original_text: item.text,
            flagged: true,
            categories: result.categories,
            category_scores: result.scores,
            threshold_exceeded: result.threshold_exceeded,
            status: 'pending'
          });

          // Return error to user
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Контент нарушает правила платформы (категория: ${result.threshold_exceeded.join(', ')}). Пожалуйста, измените текст или обратитесь в поддержку для оспаривания.`
          });
        }
      }

      // Step 2: Proceed with course creation if moderation passed
      return createCourseLogic(input, ctx);
    }
  });
  ```

- [ ] **Error Messages (Russian)**:
  - `sexual`: "Обнаружен сексуальный контент. Пожалуйста, измените текст."
  - `hate`: "Обнаружен hate speech или дискриминационный контент. Пожалуйста, измените текст."
  - `violence`: "Обнаружен контент, связанный с насилием. Пожалуйста, измените текст."
  - `self-harm`: "Обнаружен контент о самоповреждении. Если вам нужна помощь, обратитесь в поддержку."
  - `harassment`: "Обнаружен контент с угрозами или преследованием. Пожалуйста, измените текст."
  - Generic: "Контент не соответствует правилам платформы. Свяжитесь с поддержкой для уточнения."

### Phase 3: User Dispute Workflow

**Цель**: Позволить пользователям оспорить false positives

**UX Flow**:
1. User видит ошибку модерации с кнопкой "Оспорить решение"
2. Открывается форма: "Почему вы считаете, что контент безопасен?"
3. User вводит explanation (required, min 50 chars)
4. Dispute отправляется в admin review queue
5. User получает email: "Ваш запрос на рассмотрении, ожидайте ответа в течение 24 часов"
6. Admin reviews → approves/rejects
7. User получает email с решением

**Tasks**:
- [ ] **Frontend Component**: `courseai-next/components/moderation-dispute-form.tsx`
  ```tsx
  export function ModerationDisputeForm({ moderationId }: Props) {
    const [explanation, setExplanation] = useState('');

    const handleSubmit = async () => {
      await trpc.moderation.submitDispute.mutate({
        moderation_id: moderationId,
        explanation: explanation
      });

      toast.success('Запрос отправлен на рассмотрение администратору');
    };

    return (
      <Dialog>
        <DialogTrigger>Оспорить решение</DialogTrigger>
        <DialogContent>
          <h2>Оспаривание модерации</h2>
          <p>Если вы считаете, что ваш контент был ошибочно заблокирован, объясните причину:</p>
          <Textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Например: 'Это название курса по медицинской тематике, контент образовательный и не нарушает правила'"
            minLength={50}
          />
          <Button onClick={handleSubmit} disabled={explanation.length < 50}>
            Отправить на рассмотрение
          </Button>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **API Endpoint**: `packages/course-gen-platform/src/server/routers/moderation.ts`
  ```typescript
  router.mutation('submitDispute', {
    input: z.object({
      moderation_id: z.string().uuid(),
      explanation: z.string().min(50).max(1000)
    }),
    async resolve({ input, ctx }) {
      // Update moderation record
      await ctx.db.update('content_moderation_results', {
        where: { id: input.moderation_id, user_id: ctx.user.id },
        data: {
          status: 'disputed',
          dispute_explanation: input.explanation,
          disputed_at: new Date()
        }
      });

      // Send email to admins
      await sendEmail({
        to: 'admin@megacampusai.ru',
        subject: 'New Moderation Dispute',
        body: `User ${ctx.user.email} disputed moderation for: "${input.explanation}"`
      });

      return { success: true };
    }
  });
  ```

### Phase 4: Admin Review Queue

**Цель**: Дать админам интерфейс для review disputed moderation cases

**Admin Panel Page**: `packages/course-gen-platform/src/admin-panel/app/moderation/page.tsx`

**Features**:
- Table of flagged content with filters: Status (pending/disputed/approved/rejected), Category, Date range
- Columns: User Email, Moderation Type, Original Text (truncated), Categories Flagged, Score, Dispute Explanation, Actions
- Actions: "Approve" (allow content), "Reject" (keep blocked), "View Full Details"
- Bulk actions: "Approve Selected", "Reject Selected"
- Statistics: Total flagged today, Disputes pending, Approval rate

**Tasks**:
- [ ] **Admin API**: `admin.listModerationCases.query()`, `admin.reviewModeration.mutate()`
- [ ] **Admin UI**: Moderation queue page with approve/reject buttons
- [ ] **Email Notifications**:
  - User email on approval: "Ваш контент одобрен администратором, можете продолжить"
  - User email on rejection: "После рассмотрения ваш контент не соответствует правилам платформы"

### Phase 5: Monitoring & Analytics

**Цель**: Собирать метрики для optimization thresholds

**Metrics to Track**:
- Total moderation checks (per day/week/month)
- Flagged rate (% of content flagged)
- False positive rate (% of disputes approved by admin)
- Category breakdown (which categories most common)
- User satisfaction (survey после approval/rejection)

**Dashboard Widgets** (в Admin Panel):
- Line chart: Moderation checks over time
- Pie chart: Flagged content by category
- Bar chart: Dispute outcomes (approved vs rejected)
- Alert: If false positive rate >15% → "Consider adjusting thresholds"

**Tasks**:
- [ ] Add logging to `system_metrics` table for moderation events
- [ ] Create Recharts widgets in admin dashboard
- [ ] Weekly email report to admins: Moderation summary

## Technical Dependencies

**Required Before Implementation**:
1. ✅ Stage 6 (Lesson Generation) завершён (вся цепочка генерации стабильна)
2. ✅ Admin Panel имеет review queue UI (specs/ADMIN-PANEL-SPEC.md Phase 5)
3. ✅ Email notification service работает (для dispute workflow)
4. ✅ OpenAI API key available (может использоваться тот же, что для embeddings)

**Does NOT Require**:
- ❌ Breaking changes в generation pipeline (moderation — pre-check, не влияет на existing flow)
- ❌ Changes в LLM models (работает с любыми моделями)
- ❌ Database schema changes для courses table (отдельная таблица content_moderation_results)

## Success Criteria

**Implementation Считается Успешной Если**:

1. ✅ **Moderation Integration**:
   - OpenAI Moderation API вызывается для всех course titles, learning outcomes, target audience
   - Latency добавляется <500ms к course creation flow
   - Flagged content блокируется с user-friendly error message

2. ✅ **Dispute Workflow**:
   - Users могут оспорить moderation решение через UI
   - Disputes попадают в admin review queue
   - Admin может approve/reject в 1 клик
   - Users получают email notifications о статусе dispute

3. ✅ **False Positive Handling**:
   - False positive rate <15% (measured by approved disputes / total disputes)
   - Threshold tuning снижает false positives без увеличения false negatives
   - Legal educational content (медицина, право, история) не блокируется ошибочно

4. ✅ **User Experience**:
   - <5% support tickets о moderation issues в первый месяц
   - User feedback neutral или positive (не negative)
   - Course creation success rate не падает >5% after moderation integration

5. ✅ **Safety Improvement**:
   - 100% CRITICAL categories (sexual/minors, self-harm/intent) блокируются немедленно
   - >95% harmful content блокируется до генерации
   - Platform reputation не страдает от harmful content incidents

## Cost Analysis

**OpenAI Moderation API**: 🆓 **FREE** (unlimited)

**Development Cost**:
- Phase 1 (API Integration): 1 день (1 developer)
- Phase 2 (Pre-Generation Workflow): 1 день (backend changes)
- Phase 3 (Dispute Workflow): 2 дня (frontend + backend)
- Phase 4 (Admin Review Queue): 2 дня (admin panel page)
- Phase 5 (Monitoring): 1 день (metrics, dashboard widgets)

**Total**: 7 дней (1 developer) = ~$2,800 USD (at $50/hour, 8h/day)

**ROI**:
- **Risk Mitigation**: Prevents reputational damage from harmful content (~$10K+ potential loss)
- **Compliance**: Meets safety standards for B2B platforms (required for enterprise clients)
- **Trust**: Increases platform credibility with corporate customers

## Estimated Effort

**Total**: 7 дней (1 developer)

**Timeline**: Post-Stage 6 (когда платформа стабильна и есть pilot customers для testing)

## References

- specs/008-generation-generation-json/spec.md:12 - Clarification о content safety
- OpenAI Moderation API Docs: https://platform.openai.com/docs/guides/moderation
- docs/ADMIN-PANEL-SPEC.md - Admin panel queue implementation
- .claude/CLAUDE.md - Constitution principle VIII (Production-Ready Security)

---

**Version**: 1.0.0
**Created**: 2025-11-06
**Last Updated**: 2025-11-06
**Owner**: Backend Team (координация с Frontend Team для Phase 3, Admin Team для Phase 4)
