"use client"

import React from "react"
import { FormProvider } from "react-hook-form"
import { Loader2 } from "lucide-react"
import { useCreateCourseForm } from "./create-course/_hooks/useCreateCourseForm"
import { BasicInfoSection } from "./create-course/components/BasicInfoSection"
import { FormatsSection } from "./create-course/components/FormatsSection"
import { StyleSection } from "./create-course/components/StyleSection"
import { UploadSection } from "./create-course/components/UploadSection"
import { AdvancedSettingsSection } from "./create-course/components/AdvancedSettingsSection"
import { SubmitSection } from "./create-course/components/SubmitSection"
import { AuthRequiredState, PermissionDeniedState } from '@/components/common/error-states'

export default function CreateCourseForm() {
  const {
    form,
    isSubmitting,
    mounted,
    reorderedStyles,
    uploadedFiles,
    setUploadedFiles,
    isUploadingFiles,
    canCreate,
    userRole,
    draftCourseId,
    handleFormChange,
    handleFormSubmit,
    uploadSingleFile,
    toggleFormat,
    authModal,
    formats
  } = useCreateCourseForm()

  // Show loading state while checking permissions
  if (canCreate === null) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <div className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-8 border border-slate-200 dark:border-white/10 text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-white/80">Проверка прав доступа...</p>
        </div>
      </div>
    )
  }

  // Show restriction notice for unauthenticated users
  if (!canCreate && userRole === 'unauthenticated') {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <AuthRequiredState
          variant="card"
          onSignIn={() => authModal.open('login')}
          onRegister={() => authModal.open('register')}
        />
      </div>
    )
  }

  // Show restriction notice for authenticated users without permissions
  if (!canCreate) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <PermissionDeniedState
          variant="card"
          userRole={userRole}
          returnUrl="/courses"
          contactUrl="/profile"
        />
      </div>
    )
  }

  return (
    <div className="w-full mx-auto">
      <FormProvider {...form}>
        <form onSubmit={handleFormSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
          
          <BasicInfoSection onBlur={handleFormChange} />

          <FormatsSection 
            mounted={mounted} 
            toggleFormat={toggleFormat} 
            formats={formats} 
          />

          <StyleSection 
            mounted={mounted} 
            reorderedStyles={reorderedStyles} 
          />

          <UploadSection 
            draftCourseId={draftCourseId}
            uploadedFiles={uploadedFiles}
            setUploadedFiles={setUploadedFiles}
            uploadSingleFile={uploadSingleFile}
            isSubmitting={isSubmitting}
            isUploadingFiles={isUploadingFiles}
          />

          <AdvancedSettingsSection />

          <SubmitSection isSubmitting={isSubmitting} />

        </form>
      </FormProvider>
    </div>
  )
}
