import { sanitize, schemas, validateInput, validateFormData, fileValidation, securityValidation } from '@/lib/validation'

describe('Validation and Sanitization', () => {
  describe('sanitize', () => {
    it('should sanitize HTML content', () => {
      const dirtyHtml = '<script>alert("xss")</script><p>Safe content</p><a href="javascript:void(0)">Link</a>'
      const clean = sanitize.html(dirtyHtml)
      
      expect(clean).not.toContain('<script>')
      expect(clean).not.toContain('javascript:')
      expect(clean).toContain('<p>Safe content</p>')
    })

    it('should strip all HTML tags', () => {
      const htmlContent = '<div><p>Hello <strong>world</strong>!</p></div>'
      const stripped = sanitize.stripHtml(htmlContent)
      
      expect(stripped).toBe('Hello world!')
    })

    it('should sanitize text input', () => {
      const dirtyText = '  Hello\x00\x1F\x7F  world  \t\n  '
      const clean = sanitize.text(dirtyText)
      
      expect(clean).toBe('Hello world')
    })

    it('should sanitize email addresses', () => {
      const email = '  TEST@EXAMPLE.COM  '
      const clean = sanitize.email(email)
      
      expect(clean).toBe('test@example.com')
    })

    it('should sanitize file names', () => {
      const fileName = '../../../etc/passwd.txt'
      const clean = sanitize.fileName(fileName)
      
      expect(clean).toBe('_.._.._etc_passwd.txt')
      expect(clean).not.toContain('..')
      expect(clean).not.toContain('/')
    })

    it('should sanitize URLs', () => {
      expect(sanitize.url('https://example.com')).toBe('https://example.com/')
      expect(sanitize.url('javascript:alert(1)')).toBe('')
      expect(sanitize.url('ftp://example.com')).toBe('')
    })
  })

  describe('schemas', () => {
    it('should validate email schema', () => {
      const validEmail = validateInput(schemas.email, 'test@example.com')
      const invalidEmail = validateInput(schemas.email, 'not-an-email')
      
      expect(validEmail.success).toBe(true)
      expect(invalidEmail.success).toBe(false)
    })

    it('should validate course title schema', () => {
      const validTitle = validateInput(schemas.courseTitle, 'JavaScript Fundamentals')
      const shortTitle = validateInput(schemas.courseTitle, 'JS')
      const longTitle = validateInput(schemas.courseTitle, 'a'.repeat(201))
      
      expect(validTitle.success).toBe(true)
      expect(shortTitle.success).toBe(false)
      expect(longTitle.success).toBe(false)
    })

    it('should validate difficulty enum', () => {
      const validDifficulty = validateInput(schemas.difficulty, 'beginner')
      const invalidDifficulty = validateInput(schemas.difficulty, 'invalid')
      
      expect(validDifficulty.success).toBe(true)
      expect(invalidDifficulty.success).toBe(false)
    })

    it('should validate and transform file names', () => {
      const result = validateInput(schemas.fileName, '../test file.txt')
      
      if (result.success) {
        expect(result.data).toBe('_test_file.txt')
      }
    })
  })

  describe('validateFormData', () => {
    it('should validate form data successfully', () => {
      const formData = new FormData()
      formData.append('title', 'React Basics')
      formData.append('email', 'user@example.com')
      
      const result = validateFormData({
        title: schemas.courseTitle,
        email: schemas.email
      }, formData)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('React Basics')
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('should return errors for invalid form data', () => {
      const formData = new FormData()
      formData.append('title', 'JS') // Too short
      formData.append('email', 'invalid-email')
      
      const result = validateFormData({
        title: schemas.courseTitle,
        email: schemas.email
      }, formData)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })
  })

  describe('fileValidation', () => {
    it('should validate file types correctly', () => {
      const pdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const invalidFile = new File(['content'], 'test.exe', { type: 'application/octet-stream' })
      
      const isPdfValid = fileValidation.validateFileType(pdfFile, fileValidation.fileTypes.documents)
      const isExeValid = fileValidation.validateFileType(invalidFile, fileValidation.fileTypes.documents)
      
      expect(isPdfValid).toBe(true)
      expect(isExeValid).toBe(false)
    })

    it('should validate file sizes correctly', () => {
      const smallFile = new File(['small content'], 'small.txt')
      const largeContent = 'x'.repeat(51 * 1024 * 1024) // 51MB
      const largeFile = new File([largeContent], 'large.txt')
      
      const isSmallValid = fileValidation.validateFileSize(smallFile, 50 * 1024 * 1024)
      const isLargeValid = fileValidation.validateFileSize(largeFile, 50 * 1024 * 1024)
      
      expect(isSmallValid).toBe(true)
      expect(isLargeValid).toBe(false)
    })

    it('should generate safe file names', () => {
      const unsafeName = '../../../etc/passwd.txt'
      const safeName = fileValidation.getSafeFileName(unsafeName)
      
      expect(safeName).toBe('_.._.._etc_passwd.txt')
      expect(safeName).not.toContain('..')
    })
  })

  describe('securityValidation', () => {
    it('should detect XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>'
      ]
      
      xssAttempts.forEach(attempt => {
        expect(securityValidation.hasXSS(attempt)).toBe(true)
      })
      
      expect(securityValidation.hasXSS('Safe content')).toBe(false)
    })

    it('should detect SQL injection attempts', () => {
      const sqlAttempts = [
        "'; DROP TABLE users; --",
        '1 OR 1=1',
        'UNION SELECT * FROM users',
        '/* comment */ SELECT'
      ]
      
      sqlAttempts.forEach(attempt => {
        expect(securityValidation.hasSQLInjection(attempt)).toBe(true)
      })
      
      expect(securityValidation.hasSQLInjection('Normal search term')).toBe(false)
    })

    it('should detect path traversal attempts', () => {
      const pathAttempts = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '%2e%2e%2f%2e%2e%2f',
        '%2e%2e%5c%2e%2e%5c'
      ]
      
      pathAttempts.forEach(attempt => {
        expect(securityValidation.hasPathTraversal(attempt)).toBe(true)
      })
      
      expect(securityValidation.hasPathTraversal('normal/path/file.txt')).toBe(false)
    })
  })
})