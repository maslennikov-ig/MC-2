# /pdf — Конвертация Markdown в PDF с Mermaid

Конвертирует Markdown-файлы в красиво оформленные PDF с полной поддержкой Mermaid-диаграмм (flowchart, gantt, sequence и др.).

## Использование

```
/pdf docs/offers/proposal.md              # → docs/offers/proposal.pdf
/pdf README.md output.pdf                 # → output.pdf
/pdf --install                            # Только установить зависимости
```

## Возможности

- GitHub-стиль оформления (шрифты, таблицы, код)
- Mermaid v11 (flowchart, gantt, sequence, class, state, er, pie)
- Кириллица и эмодзи в диаграммах
- Автоматическая установка зависимостей

## Зависимости

Скилл автоматически установит при первом запуске:

- `@mermaid-js/mermaid-cli` (mmdc) — рендеринг диаграмм
- `md-mermaid-to-pdf` — конвертация MD → PDF с GitHub CSS

## Алгоритм

1. Проверить/установить зависимости
2. Найти все `mermaid` блоки в markdown
3. Отрендерить каждый через `mmdc` (v11) в SVG
4. Заменить блоки на inline SVG
5. Сконвертировать в PDF через `md-to-pdf` (Puppeteer + GitHub CSS)

---

## Инструкции для Claude

### Шаг 1: Проверка зависимостей

```bash
# Проверяем mmdc
if ! command -v mmdc &>/dev/null; then
  echo "📦 Установка @mermaid-js/mermaid-cli..."
  npm install -g @mermaid-js/mermaid-cli
fi

# Проверяем md-to-pdf
if ! command -v md-to-pdf &>/dev/null; then
  echo "📦 Установка md-mermaid-to-pdf..."
  npm install -g md-mermaid-to-pdf
fi

echo "✅ Зависимости готовы"
mmdc --version
```

### Шаг 2: Конвертация

Используй Python для обработки Mermaid-блоков и Bash для финальной конвертации.

**Python-скрипт для обработки Mermaid:**

````python
import re
import subprocess
import os
import sys
import tempfile

def convert_md_to_pdf(input_path, output_path=None):
    """Конвертирует Markdown в PDF с поддержкой Mermaid v11."""

    if output_path is None:
        output_path = input_path.rsplit('.', 1)[0] + '.pdf'

    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    temp_dir = tempfile.mkdtemp()
    counter = [0]

    def replace_mermaid(match):
        counter[0] += 1
        mermaid_code = match.group(1)
        mmd_file = f"{temp_dir}/mermaid-{counter[0]}.mmd"
        svg_file = f"{temp_dir}/mermaid-{counter[0]}.svg"

        with open(mmd_file, 'w', encoding='utf-8') as f:
            f.write(mermaid_code)

        print(f"  🎨 Диаграмма {counter[0]}...", file=sys.stderr)

        result = subprocess.run(
            ['mmdc', '-i', mmd_file, '-o', svg_file, '-b', 'white', '-t', 'default', '-w', '800'],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode == 0 and os.path.exists(svg_file):
            with open(svg_file, 'r', encoding='utf-8') as f:
                svg = f.read()
            return f'\n<div style="text-align:center;margin:1.5em 0">\n{svg}\n</div>\n'
        else:
            print(f"  ⚠️  Ошибка mmdc: {result.stderr}", file=sys.stderr)
            return match.group(0)

    pattern = r'```mermaid\n([\s\S]*?)```'
    new_content = re.sub(pattern, replace_mermaid, content)

    temp_md = f"{temp_dir}/document.md"
    with open(temp_md, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"  ✅ Обработано диаграмм: {counter[0]}", file=sys.stderr)
    print(f"  📑 Генерация PDF...", file=sys.stderr)

    subprocess.run(['md-to-pdf', temp_md, output_path], check=True)

    # Cleanup
    import shutil
    shutil.rmtree(temp_dir)

    return output_path

if __name__ == '__main__':
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    result = convert_md_to_pdf(input_file, output_file)
    print(f"✅ Готово: {result}")
````

### Шаг 3: Выполнение

```bash
# Сохрани Python-скрипт во временный файл и запусти
python3 /tmp/md-to-pdf-convert.py "INPUT_FILE" "OUTPUT_FILE"
```

### Быстрый вариант (inline)

Для простых случаев можно использовать однострочник:

````bash
INPUT="docs/file.md"
OUTPUT="${INPUT%.md}.pdf"

# Создать временную директорию
TEMP=$(mktemp -d)

# Python inline для обработки mermaid
python3 << 'PYEOF'
import re, subprocess, os, sys, tempfile, shutil

input_file, output_file, temp_dir = sys.argv[1], sys.argv[2], sys.argv[3]

with open(input_file) as f: content = f.read()

counter = [0]
def repl(m):
    counter[0] += 1
    mmd, svg = f"{temp_dir}/m{counter[0]}.mmd", f"{temp_dir}/m{counter[0]}.svg"
    open(mmd,'w').write(m.group(1))
    subprocess.run(['mmdc','-i',mmd,'-o',svg,'-b','white','-w','800'], capture_output=True)
    if os.path.exists(svg):
        return f'<div style="text-align:center;margin:1.5em 0">{open(svg).read()}</div>'
    return m.group(0)

content = re.sub(r'```mermaid\n([\s\S]*?)```', repl, content)
temp_md = f"{temp_dir}/doc.md"
open(temp_md,'w').write(content)
subprocess.run(['md-to-pdf', temp_md, output_file])
print(f"✅ {output_file} ({counter[0]} диаграмм)")
PYEOF
python3 - "$INPUT" "$OUTPUT" "$TEMP"

rm -rf "$TEMP"
````

## Примеры

### Базовое использование

```
/pdf docs/proposal.md
```

### С указанием выходного файла

```
/pdf docs/offer.md ~/Desktop/offer-final.pdf
```

### Только установка зависимостей

```
/pdf --install
```

## Troubleshooting

**Ошибка "mmdc not found":**

```bash
npm install -g @mermaid-js/mermaid-cli
```

**Ошибка "md-to-pdf not found":**

```bash
npm install -g md-mermaid-to-pdf
```

**Mermaid syntax error:**

- Проверь синтаксис на https://mermaid.live
- mmdc v11 поддерживает все современные фичи

**Кириллица не отображается:**

- mmdc v11 корректно обрабатывает Unicode
- Если проблема — добавь `fontFamily: 'Arial'` в mermaid config
