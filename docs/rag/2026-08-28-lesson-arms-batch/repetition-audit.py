import json, re, sys, itertools
from collections import defaultdict, Counter

path = sys.argv[1]
rows = json.load(open(path))

WORD = re.compile(r"[0-9a-zA-Zа-яёА-ЯЁ]+", re.UNICODE)

def words(t):
    return WORD.findall(t.lower())

def ngrams(ws, n=8):
    return {tuple(ws[i:i+n]) for i in range(len(ws) - n + 1)}

def sentences(t):
    # strip markdown noise that repeats structurally rather than semantically
    t = re.sub(r"```.*?```", " ", t, flags=re.S)
    t = re.sub(r"\|", " ", t)
    parts = re.split(r"(?<=[.!?])\s+|\n+", t)
    out = []
    for p in parts:
        ws = words(p)
        if len(ws) >= 8:
            out.append(" ".join(ws))
    return out

by_course = defaultdict(list)
for r in rows:
    by_course[r["courseId"]].append(r)

print(f"{'course':38} {'lessons':>7} {'max8g':>7} {'p95':>6} {'mean':>6} {'rep.sent':>9} {'lessons w/rep':>14}")
print("-" * 92)

course_stats = {}
for cid, lessons in sorted(by_course.items(), key=lambda kv: -len(kv[1])):
    if len(lessons) < 5:
        continue
    grams = [ngrams(words(l["text"])) for l in lessons]
    sims = []
    worst = (0, None, None)
    for i, j in itertools.combinations(range(len(lessons)), 2):
        a, b = grams[i], grams[j]
        if not a or not b:
            continue
        inter = len(a & b)
        # containment: share of the smaller lesson that also appears in the other
        s = inter / min(len(a), len(b))
        sims.append(s)
        if s > worst[0]:
            worst = (s, lessons[i]["label"], lessons[j]["label"])
    sims.sort()
    sent_index = defaultdict(set)
    for l in lessons:
        for s in set(sentences(l["text"])):
            sent_index[s].add(l["label"])
    repeated = {s: labs for s, labs in sent_index.items() if len(labs) >= 2}
    lessons_with_rep = len({lab for labs in repeated.values() for lab in labs})
    mx = sims[-1] if sims else 0
    p95 = sims[int(len(sims) * 0.95)] if sims else 0
    mean = sum(sims) / len(sims) if sims else 0
    course_stats[cid] = dict(
        lessons=len(lessons), max=mx, p95=p95, mean=mean,
        repeated_sentences=len(repeated), lessons_with_rep=lessons_with_rep,
        worst=worst, repeated=repeated,
    )
    print(f"{cid:38} {len(lessons):7} {mx:7.3f} {p95:6.3f} {mean:6.3f} {len(repeated):9} "
          f"{lessons_with_rep:>6}/{len(lessons):<7}")

print()
for cid, st in course_stats.items():
    print(f"\n=== {cid}  worst pair {st['worst'][1]} vs {st['worst'][2]}  containment {st['worst'][0]:.3f}")
    top = sorted(st["repeated"].items(), key=lambda kv: -len(kv[1]))[:6]
    for s, labs in top:
        print(f"   in {len(labs):>3} lessons: {s[:150]}")
