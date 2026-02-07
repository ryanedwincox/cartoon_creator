// useFiles: Composable for project file operations (list, read, save, delete). NOT concerned with: file display or UI.
import { inject, ref, type InjectionKey } from 'vue'

const API_BASE = '/api'
const DATA_BASE = '/data'

export type FileType = 'png' | 'svg' | 'json' | 'txt' | 'other'

export const VIEWABLE_TYPES: FileType[] = ['png', 'svg', 'txt', 'json']

export interface FileInfo {
  name: string
  type: FileType
  size: number
  mtime: number
  is_hidden: boolean
}

export const FilesKey: InjectionKey<ReturnType<typeof useFiles>> = Symbol('files')

export function useInjectedFiles(): ReturnType<typeof useFiles> {
  const ctx = inject(FilesKey)
  if (!ctx) throw new Error('useInjectedFiles requires a provider ancestor using FilesKey')
  return ctx
}

export function useFiles(projectId: string) {
  const files = ref<FileInfo[]>([])
  const loading = ref(false)
  const uploading = ref(false)

  const loadFiles = async () => {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/files/${projectId}`)
      if (res.ok) {
        files.value = await res.json()
      }
    } finally {
      loading.value = false
    }
  }

  const getFileUrl = (filename: string, mtime?: number) => {
    const base = `${DATA_BASE}/${projectId}/${filename}`
    return mtime ? `${base}?v=${mtime}` : base
  }

  const saveFile = async (filename: string, content: string) => {
    const res = await fetch(`${API_BASE}/files/${projectId}/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error('Failed to save file')
    await loadFiles()
  }

  const getFileText = async (filename: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/files/${projectId}/${filename}/text`)
    if (!res.ok) {
      const detail = await res.text().catch(() => 'unknown')
      throw new Error(`Failed to read text file (${res.status}): ${detail}`)
    }
    const data = await res.json()
    return data.content
  }

  const deleteFile = async (filename: string) => {
    const res = await fetch(`${API_BASE}/files/${projectId}/${filename}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete file')
    await loadFiles()
  }

  const uploadFile = async (file: File) => {
    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/files/${projectId}/${file.name}`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Failed to upload file')
      await loadFiles()
    } finally {
      uploading.value = false
    }
  }

  return {
    files,
    loading,
    uploading,
    loadFiles,
    getFileUrl,
    getFileText,
    saveFile,
    deleteFile,
    uploadFile,
  }
}
