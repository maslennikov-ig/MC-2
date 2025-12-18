/**
 * Генерация SEO-friendly slug из русского текста
 */

const translitMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
  'Е': 'E', 'Ё': 'E', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
  'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
  'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
  'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch',
  'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
  'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
}

export function transliterate(text: string): string {
  return text
    .split('')
    .map(char => translitMap[char] || char)
    .join('')
}

export function generateSlug(text: string, suffix?: string): string {
  // Транслитерация русского текста
  let slug = transliterate(text)
    .toLowerCase()
    // Заменяем все не-буквенно-цифровые символы на дефисы
    .replace(/[^a-z0-9]+/g, '-')
    // Убираем дефисы в начале и конце
    .replace(/^-+|-+$/g, '')
    // Убираем множественные дефисы
    .replace(/-+/g, '-')

  // Добавляем суффикс если он есть
  if (suffix && suffix.length > 0) {
    slug = `${slug}-${suffix}`
  }

  // Ограничиваем длину slug'а до 95 символов (с запасом от лимита в 100)
  if (slug.length > 95) {
    // Обрезаем по последнему дефису, чтобы не резать слова
    const lastDash = slug.substring(0, 95).lastIndexOf('-')
    slug = lastDash > 50 ? slug.substring(0, lastDash) : slug.substring(0, 95).replace(/-+$/, '')
  }

  // Если slug пустой или слишком короткий, используем запасной вариант
  if (!slug || slug.length < 3) {
    slug = suffix ? `course-${suffix}` : 'course'
  }

  return slug
}

