async function globalTeardown() {
  console.log('🧹 Running global test teardown...')
  
  try {
    // Clean up any global test data or resources
    // For example, reset database state, clean up files, etc.
    
    // Clean up any test files in public directory
    // await fs.promises.rm('./public/test-uploads', { recursive: true, force: true })
    
    console.log('✅ Global teardown completed successfully')
  } catch (error) {
    console.error('❌ Global teardown failed:', error)
    // Don't throw error in teardown to avoid breaking the test run
  }
}

export default globalTeardown