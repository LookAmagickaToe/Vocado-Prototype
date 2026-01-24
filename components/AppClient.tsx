"use client"

import { useMemo, useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

import family from "@/data/worlds/family.json"
import basic_verbs from "@/data/worlds/basic_verbs.json"
import verbs_conjugation from "@/data/worlds/verbs_conjugation.json"
import verbs_conjugation_espanol from "@/data/worlds/verbs_conjugation_espanol.json"
import kitchen_utensils from "@/data/worlds/kitchen_utensils.json"
import social_relationships from "@/data/worlds/social_relationships.json"
import basic_english from "@/data/worlds/basic_english.json"
import new_year from "@/data/worlds/new_year.json"

import { formatTemplate } from "@/lib/ui"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import phrases_basic from "@/data/worlds/phrases_basic.json"
import PhraseMemoryGame from "@/components/games/PhraseMemoryGame"
import type { World } from "@/types/worlds"
import uiSettings from "@/data/ui/settings.json"
import { supabase } from "@/lib/supabase/client"
import UserMenu from "@/components/UserMenu"

//Adapt here for verbs
const BASE_WORLDS = [basic_verbs, family, phrases_basic, verbs_conjugation, 
  verbs_conjugation_espanol, social_relationships, kitchen_utensils, new_year,
basic_english] as unknown as World[]

const UPLOADED_WORLDS_STORAGE_KEY = "vocab-memory-uploaded-worlds"
const WORLD_LISTS_STORAGE_KEY = "vocab-memory-world-lists"
const WORLD_TITLE_OVERRIDES_STORAGE_KEY = "vocab-memory-world-title-overrides"
const WORLD_LIST_COLLAPSED_STORAGE_KEY = "vocab-memory-world-list-collapsed"
const HIDDEN_WORLDS_STORAGE_KEY = "vocab-memory-hidden-worlds"

type WorldList = {
  id: string
  name: string
  worldIds: string[]
}

type ReviewItem = {
  id: string
  source: string
  target: string
  pos: "verb" | "noun" | "adj" | "other"
  lemma?: string
  emoji?: string
  include: boolean
  conjugate: boolean
}

type UploadTab = "table" | "upload" | "theme" | "json"
type UploadModeSelection = "auto" | "vocab" | "conjugation"

const ui = {
  menu: {
    title: uiSettings?.menu?.title ?? "Menú",
    worlds: uiSettings?.menu?.worlds ?? "Mundos",
    upload: uiSettings?.menu?.upload ?? "Subir lista",
    manage: uiSettings?.menu?.manage ?? "Gestion",
    locked: uiSettings?.menu?.locked ?? "🔒 Locked",
    restart: uiSettings?.menu?.restart ?? "Reanudar",
  },
  worldsOverlay: {
    title: uiSettings?.worldsOverlay?.title ?? "🌎 Mundos",
    description:
      uiSettings?.worldsOverlay?.description ??
      "Selecciona un mundo para cargar un nuevo conjunto de vocabulario.",
    active: uiSettings?.worldsOverlay?.active ?? "Active",
    close: uiSettings?.worldsOverlay?.close ?? "Close",
    newListPlaceholder: uiSettings?.worldsOverlay?.newListPlaceholder ?? "Nueva lista",
    newListButton: uiSettings?.worldsOverlay?.newListButton ?? "Crear",
    unlisted: uiSettings?.worldsOverlay?.unlisted ?? "Sin lista",
    hideWorld: uiSettings?.worldsOverlay?.hideWorld ?? "Ocultar",
  },
  levelsOverlay: {
    titleSuffix: uiSettings?.levelsOverlay?.titleSuffix ?? "— Levels",
    close: uiSettings?.levelsOverlay?.close ?? "Close",
    defaultDescription:
      uiSettings?.levelsOverlay?.defaultDescription ??
      "Choose a subworld (chunk of {itemsPerGame} items).",
  },
  upload: {
    title: uiSettings?.upload?.title ?? "Subir lista",
    description:
      uiSettings?.upload?.description ??
      "Crea vocabulario desde JSON, una tabla, un archivo o una imagen.",
    nameLabel: uiSettings?.upload?.nameLabel ?? "Nombre",
    namePlaceholder: uiSettings?.upload?.namePlaceholder ?? "Mi lista personalizada",
    listLabel: uiSettings?.upload?.listLabel ?? "Lista",
    modeLabel: uiSettings?.upload?.modeLabel ?? "Modo",
    modeAuto: uiSettings?.upload?.modeAuto ?? "Auto",
    modeVocab: uiSettings?.upload?.modeVocab ?? "Vocabulario",
    modeConjugation: uiSettings?.upload?.modeConjugation ?? "Conjugación",
    destinationLabel: uiSettings?.upload?.destinationLabel ?? "Destino",
    destinationNew: uiSettings?.upload?.destinationNew ?? "Nuevo mundo",
    tabJson: uiSettings?.upload?.tabJson ?? "JSON",
    tabTable: uiSettings?.upload?.tabTable ?? "Tabla",
    tabUpload: uiSettings?.upload?.tabUpload ?? "Archivo/Imagen",
    tabTheme: uiSettings?.upload?.tabTheme ?? "Tema",
    jsonLabel: uiSettings?.upload?.jsonLabel ?? "Contenido (JSON)",
    jsonPlaceholder: uiSettings?.upload?.jsonPlaceholder ?? '[{"es":"hola","de":"hallo"}]',
    tableSource: uiSettings?.upload?.tableSource ?? "Español",
    tableTarget: uiSettings?.upload?.tableTarget ?? "Alemán",
    tableAddRow: uiSettings?.upload?.tableAddRow ?? "Agregar fila",
    tableHint:
      uiSettings?.upload?.tableHint ?? "Completa las dos columnas y genera la lista.",
    fileLabel: uiSettings?.upload?.fileLabel ?? "Subir lista de palabras",
    fileHint:
      uiSettings?.upload?.fileHint ??
      "Acepta .txt o .csv. Gemini generará el JSON.",
    imageLabel: uiSettings?.upload?.imageLabel ?? "Subir imagen",
    imageCameraLabel: uiSettings?.upload?.imageCameraLabel ?? "Cámara",
    imageGalleryLabel: uiSettings?.upload?.imageGalleryLabel ?? "Galería",
    imageHint:
      uiSettings?.upload?.imageHint ??
      "Gemini extraerá el vocabulario desde la imagen.",
    themeLabel: uiSettings?.upload?.themeLabel ?? "Tema",
    themePlaceholder:
      uiSettings?.upload?.themePlaceholder ??
      "Ej: 50 palabras sobre utensilios de cocina para nivel B2",
    themeCountLabel: uiSettings?.upload?.themeCountLabel ?? "Cantidad",
    themeLevelLabel: uiSettings?.upload?.themeLevelLabel ?? "Nivel",
    themeLevelA1: uiSettings?.upload?.themeLevelA1 ?? "A1",
    themeLevelA2: uiSettings?.upload?.themeLevelA2 ?? "A2",
    themeLevelB1: uiSettings?.upload?.themeLevelB1 ?? "B1",
    themeLevelB2: uiSettings?.upload?.themeLevelB2 ?? "B2",
    themeLevelC1: uiSettings?.upload?.themeLevelC1 ?? "C1",
    themeLevelC2: uiSettings?.upload?.themeLevelC2 ?? "C2",
    reviewTitle: uiSettings?.upload?.reviewTitle ?? "Revisar vocabulario",
    reviewHint:
      uiSettings?.upload?.reviewHint ??
      "Edita, agrega o quita palabras antes de guardar.",
    reviewInclude: uiSettings?.upload?.reviewInclude ?? "Incluir",
    reviewSource: uiSettings?.upload?.reviewSource ?? "Español",
    reviewTarget: uiSettings?.upload?.reviewTarget ?? "Alemán",
    reviewEmoji: uiSettings?.upload?.reviewEmoji ?? "Emoji",
    reviewPos: uiSettings?.upload?.reviewPos ?? "Tipo",
    reviewConjugate: uiSettings?.upload?.reviewConjugate ?? "Conjugación",
    posVerb: uiSettings?.upload?.posVerb ?? "verbo",
    posNoun: uiSettings?.upload?.posNoun ?? "sustantivo",
    posAdj: uiSettings?.upload?.posAdj ?? "adjetivo",
    posOther: uiSettings?.upload?.posOther ?? "otro",
    reviewAddRow: uiSettings?.upload?.reviewAddRow ?? "Agregar palabra",
    reviewBack: uiSettings?.upload?.reviewBack ?? "Volver",
    reviewDone: uiSettings?.upload?.reviewDone ?? "Guardar y jugar",
    actionGenerate: uiSettings?.upload?.actionGenerate ?? "Generar vista previa",
    actionSave: uiSettings?.upload?.actionSave ?? "Guardar y jugar",
    actionCancel: uiSettings?.upload?.actionCancel ?? "Cancelar",
    actionReview: uiSettings?.upload?.actionReview ?? "Revisar",
    hiddenWorldsTitle: uiSettings?.upload?.hiddenWorldsTitle ?? "Mundos ocultos",
    restoreWorld: uiSettings?.upload?.restoreWorld ?? "Restaurar",
    processing: uiSettings?.upload?.processing ?? "Procesando...",
    errorNoInput: uiSettings?.upload?.errorNoInput ?? "Agrega contenido antes de continuar.",
    errorInvalidJson:
      uiSettings?.upload?.errorInvalidJson ?? "JSON inválido. Revisa el formato.",
    errorInvalidList:
      uiSettings?.upload?.errorInvalidList ??
      "Lista inválida. Usa una lista de pares o un objeto World.",
    errorNoItems:
      uiSettings?.upload?.errorNoItems ?? "No hay vocabulario para guardar.",
    errorNoVerbs:
      uiSettings?.upload?.errorNoVerbs ?? "No hay verbos seleccionados para conjugación.",
  },
  conjugationWorld: {
    titleSuffix: uiSettings?.conjugationWorld?.titleSuffix ?? "— Conjugación",
    instructions:
      uiSettings?.conjugationWorld?.instructions ??
      "Empareja pronombres con la conjugación correcta.",
    primaryLabel: uiSettings?.conjugationWorld?.primaryLabel ?? "Pronombre:",
    secondaryLabel: uiSettings?.conjugationWorld?.secondaryLabel ?? "Conjugación:",
    rightTitle: uiSettings?.conjugationWorld?.rightTitle ?? "Matches",
    emptyHint:
      uiSettings?.conjugationWorld?.emptyHint ?? "Encuentra una pareja para empezar.",
  },
}

function normalizeUploadedWorld(payload: any, name?: string): World | null {
  if (!payload) return null

  if (Array.isArray(payload)) {
    const pool = payload
      .map((item: any, index: number) => {
        if (!item || typeof item !== "object") return null
        const es = typeof item.es === "string" ? item.es : typeof item.left === "string" ? item.left : ""
        const de = typeof item.de === "string" ? item.de : typeof item.right === "string" ? item.right : ""
        if (!es || !de) return null
        const id = typeof item.id === "string" && item.id ? item.id : `uploaded-${index}-${es}`
        const image = item.image && typeof item.image === "object"
          ? item.image
          : { type: "emoji", value: "📝" }
        return { id, es, de, image, pos: item.pos }
      })
      .filter(Boolean)

    if (!pool.length) return null

    return {
      id: `upload-${Date.now()}`,
      title: name && name.trim().length > 0 ? name.trim() : "Uploaded list",
      description: "Custom uploaded word list.",
      mode: "vocab",
      pool,
      chunking: { itemsPerGame: 8 },
    } as World
  }

  if (typeof payload === "object" && payload.pool && payload.mode) {
    const normalized = { ...payload }
    if (!normalized.id) {
      normalized.id = `upload-${Date.now()}`
    }
    if (name && name.trim().length > 0) {
      normalized.title = name.trim()
    } else if (!normalized.title) {
      normalized.title = "Uploaded list"
    }
    if (!normalized.chunking) {
      normalized.chunking = { itemsPerGame: 8 }
    }
    if (normalized.mode === "vocab" && Array.isArray(normalized.pool)) {
      normalized.pool = normalized.pool
        .map((item: any, index: number) => {
          if (!item || typeof item !== "object") return null
          const es = typeof item.es === "string" ? item.es : ""
          const de = typeof item.de === "string" ? item.de : ""
          if (!es || !de) return null
          const id = typeof item.id === "string" && item.id ? item.id : `uploaded-${index}-${es}`
          const image = item.image && typeof item.image === "object"
            ? item.image
            : { type: "emoji", value: "📝" }
          return { ...item, id, es, de, image }
        })
        .filter(Boolean)
    }
    return normalized as World
  }

  return null
}


function extractVerbLabelFromPair(p: { id: string; es: string }) {
  // Prefer "(sein)" from the ES string
  const m = p.es.match(/\(([^)]+)\)/)
  if (m?.[1]) return m[1].trim()

  // Fallback: from id "sein_1ps" -> "sein"
  const prefix = p.id.split("_")[0]
  return prefix || ""
}

type AppClientProps = {
  initialUploadedWorlds?: World[]
  initialLists?: WorldList[]
  initialHiddenWorldIds?: string[]
  initialWorldTitleOverrides?: Record<string, string>
  initialSupabaseLoaded?: boolean
}

export default function AppClient({
  initialUploadedWorlds = [],
  initialLists = [],
  initialHiddenWorldIds = [],
  initialWorldTitleOverrides = {},
  initialSupabaseLoaded = false,
}: AppClientProps) {
  const [isAuthed, setIsAuthed] = useState(true)
  const [isSupabaseLoaded, setIsSupabaseLoaded] = useState(initialSupabaseLoaded)
  const [uploadedWorlds, setUploadedWorlds] = useState<World[]>(initialUploadedWorlds)
  const allWorlds = useMemo(() => [...BASE_WORLDS, ...uploadedWorlds], [uploadedWorlds])
  const [worldLists, setWorldLists] = useState<WorldList[]>(initialLists)
  const [worldTitleOverrides, setWorldTitleOverrides] = useState<Record<string, string>>(
    initialWorldTitleOverrides
  )
  const [collapsedListIds, setCollapsedListIds] = useState<Record<string, boolean>>({})
  const [hiddenWorldIds, setHiddenWorldIds] = useState<string[]>(initialHiddenWorldIds)

  const [worldId, setWorldId] = useState<string>(BASE_WORLDS[0]?.id ?? "world-0")
  const [levelIndex, setLevelIndex] = useState<number>(0)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isWorldsOpen, setIsWorldsOpen] = useState(false)
  const [isLevelsOpen, setIsLevelsOpen] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [pendingWorldId, setPendingWorldId] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState("")
  const [uploadText, setUploadText] = useState("")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadListId, setUploadListId] = useState<string>("")
  const [newListName, setNewListName] = useState("")
  const [uploadTab, setUploadTab] = useState<UploadTab>("table")
  const [uploadStep, setUploadStep] = useState<"input" | "review">("input")
  const [uploadModeSelection, setUploadModeSelection] = useState<UploadModeSelection>("auto")
  const [isProcessingUpload, setIsProcessingUpload] = useState(false)
  const [tableRows, setTableRows] = useState<Array<{ source: string; target: string }>>([
    { source: "", target: "" },
  ])
  const [fileUploadText, setFileUploadText] = useState("")
  const [fileUploadName, setFileUploadName] = useState("")
  const [imageUpload, setImageUpload] = useState<{
    data: string
    mimeType: string
    previewUrl: string
  } | null>(null)
  const [themeText, setThemeText] = useState("")
  const [themeCount, setThemeCount] = useState(20)
  const [themeLevel, setThemeLevel] = useState("B1")
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewMode, setReviewMode] = useState<"vocab" | "conjugation">("vocab")
  const [uploadTargetWorldId, setUploadTargetWorldId] = useState<string>("new")
  const [isListPickerOpen, setIsListPickerOpen] = useState(false)
  const [listPickerName, setListPickerName] = useState("")

  // used to force-remount the game (restart) without touching game internals
  const [gameSeed, setGameSeed] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(UPLOADED_WORLDS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sanitized = parsed.map((item) => normalizeUploadedWorld(item)).filter(Boolean) as World[]
        if (sanitized.length) {
          setUploadedWorlds(sanitized)
        }
      }
    } catch {
      // ignore malformed persisted data
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(UPLOADED_WORLDS_STORAGE_KEY, JSON.stringify(uploadedWorlds))
  }, [uploadedWorlds])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(WORLD_TITLE_OVERRIDES_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        setWorldTitleOverrides(parsed as Record<string, string>)
      }
    } catch {
      // ignore malformed persisted data
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      WORLD_TITLE_OVERRIDES_STORAGE_KEY,
      JSON.stringify(worldTitleOverrides)
    )
  }, [worldTitleOverrides])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(WORLD_LIST_COLLAPSED_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        setCollapsedListIds(parsed as Record<string, boolean>)
      }
    } catch {
      // ignore malformed persisted data
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      WORLD_LIST_COLLAPSED_STORAGE_KEY,
      JSON.stringify(collapsedListIds)
    )
  }, [collapsedListIds])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(HIDDEN_WORLDS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setHiddenWorldIds(parsed.filter((id) => typeof id === "string"))
      }
    } catch {
      // ignore malformed persisted data
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(HIDDEN_WORLDS_STORAGE_KEY, JSON.stringify(hiddenWorldIds))
  }, [hiddenWorldIds])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const hasSession = !!data.session
      setIsAuthed(hasSession)
      if (data.session?.user) {
        fetch("/api/auth/profile/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.session.user.id,
            email: data.session.user.email,
          }),
        })
        if (!isSupabaseLoaded) {
          loadSupabaseState()
        }
      }
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session)
      if (session?.user) {
        fetch("/api/auth/profile/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        })
        if (!isSupabaseLoaded) {
          loadSupabaseState()
        }
      }
    })
    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [isSupabaseLoaded])

  useEffect(() => {
    if (!isAuthed || !isSupabaseLoaded) return
    const id = window.setTimeout(() => {
      syncSupabaseState()
    }, 500)
    return () => window.clearTimeout(id)
  }, [isAuthed, isSupabaseLoaded, worldLists, uploadedWorlds, hiddenWorldIds, worldTitleOverrides])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(WORLD_LISTS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map((item) => {
            if (!item || typeof item !== "object") return null
            if (typeof item.id !== "string" || typeof item.name !== "string") return null
            const worldIds = Array.isArray(item.worldIds)
              ? item.worldIds.filter((id: any) => typeof id === "string")
              : []
            return { id: item.id, name: item.name, worldIds }
          })
          .filter(Boolean) as WorldList[]
        setWorldLists(sanitized)
      }
    } catch {
      // ignore malformed persisted data
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(WORLD_LISTS_STORAGE_KEY, JSON.stringify(worldLists))
  }, [worldLists])

  const visibleWorlds = useMemo(
    () => allWorlds.filter((w) => !hiddenWorldIds.includes(w.id)),
    [allWorlds, hiddenWorldIds]
  )

  const uploadedWorldIdSet = useMemo(
    () => new Set(uploadedWorlds.map((w) => w.id)),
    [uploadedWorlds]
  )

  const appendableWorlds = useMemo(
    () =>
      allWorlds
        .filter((world) => world.mode === "vocab" && world.submode !== "conjugation")
        .map((world) => ({
          id: world.id,
          title: getWorldTitle(world.id, world.title),
          isUploaded: uploadedWorldIdSet.has(world.id),
        })),
    [allWorlds, getWorldTitle, uploadedWorldIdSet]
  )

  const currentWorld = useMemo(() => {
    return visibleWorlds.find((w) => w.id === worldId) ?? visibleWorlds[0] ?? allWorlds[0]
  }, [visibleWorlds, allWorlds, worldId])

  const levelsCount = useMemo(() => {
    const k = currentWorld.chunking.itemsPerGame
    return Math.max(1, Math.ceil(currentWorld.pool.length / k))
  }, [currentWorld])

    const worldTitle = worldTitleOverrides[currentWorld.id] ?? currentWorld.title
    const safeLevel = Math.min(levelIndex, levelsCount - 1) + 1




  const openWorlds = () => {
    setIsWorldsOpen(true)
    setIsMenuOpen(false)
  }

  const createList = () => {
    const name = newListName.trim()
    if (!name) return
    setWorldLists((prev) => [...prev, { id: `list-${Date.now()}`, name, worldIds: [] }])
    setNewListName("")
  }

  const addList = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return ""
    const id = `list-${Date.now()}`
    setWorldLists((prev) => [...prev, { id, name: trimmed, worldIds: [] }])
    return id
  }

  const renameList = (listId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setWorldLists((prev) =>
      prev.map((list) => (list.id === listId ? { ...list, name: trimmed } : list))
    )
  }

  const renameWorld = (worldId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setWorldTitleOverrides((prev) => ({ ...prev, [worldId]: trimmed }))
  }

  function getWorldTitle(worldId: string, fallback: string) {
    return worldTitleOverrides[worldId] ?? fallback
  }

  const hideWorld = (id: string) => {
    setHiddenWorldIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setWorldLists((prev) =>
      prev.map((list) => ({
        ...list,
        worldIds: list.worldIds.filter((wid) => wid !== id),
      }))
    )
    if (id === worldId) {
      const next = visibleWorlds.find((w) => w.id !== id)
      if (next) {
        setWorldId(next.id)
      }
    }
  }

  const restoreWorld = (worldId: string) => {
    setHiddenWorldIds((prev) => prev.filter((id) => id !== worldId))
  }

  const assignWorldToList = (worldId: string, listId: string | null) => {
    setWorldLists((prev) => {
      let next = prev.map((list) => ({
        ...list,
        worldIds: list.worldIds.filter((id) => id !== worldId),
      }))
      if (listId) {
        next = next.map((list) =>
          list.id === listId
            ? { ...list, worldIds: [...list.worldIds, worldId] }
            : list
        )
      }
      return next
    })
  }

  const moveWorldInList = (listId: string, worldId: string, direction: "up" | "down") => {
    setWorldLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list
        const idx = list.worldIds.indexOf(worldId)
        if (idx < 0) return list
        const nextIndex = direction === "up" ? Math.max(0, idx - 1) : Math.min(list.worldIds.length - 1, idx + 1)
        if (nextIndex === idx) return list
        const nextIds = [...list.worldIds]
        nextIds.splice(idx, 1)
        nextIds.splice(nextIndex, 0, worldId)
        return { ...list, worldIds: nextIds }
      })
    )
  }

  const moveList = (listId: string, direction: "up" | "down") => {
    setWorldLists((prev) => {
      const idx = prev.findIndex((list) => list.id === listId)
      if (idx < 0) return prev
      const nextIndex = direction === "up" ? Math.max(0, idx - 1) : Math.min(prev.length - 1, idx + 1)
      if (nextIndex === idx) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const listNameForUpload =
    worldLists.find((list) => list.id === uploadListId)?.name ?? ""

  const resetUploadState = () => {
    if (imageUpload?.previewUrl) {
      URL.revokeObjectURL(imageUpload.previewUrl)
    }
    setUploadName("")
    setUploadText("")
    setUploadError(null)
    setUploadListId("")
    setUploadTab("table")
    setUploadStep("input")
    setUploadModeSelection("auto")
    setIsProcessingUpload(false)
    setTableRows([{ source: "", target: "" }])
    setFileUploadText("")
    setFileUploadName("")
    setImageUpload(null)
    setThemeText("")
    setThemeCount(20)
    setThemeLevel("B1")
    setReviewItems([])
    setReviewMode("vocab")
    setUploadTargetWorldId("new")
  }

  const startReview = (items: ReviewItem[], mode: "vocab" | "conjugation") => {
    setReviewItems(items)
    setReviewMode(mode)
    setUploadStep("review")
  }

  const callAi = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    let data: any = null
    try {
      data = await response.json()
    } catch {
      const text = await response.text().catch(() => "")
      data = { error: text }
    }
    if (!response.ok) {
      const detailsMessage =
        data?.details?.error?.message ||
        data?.details?.error?.status ||
        data?.details?.error ||
        data?.details?.message
      throw new Error(detailsMessage || data?.error || "AI request failed")
    }
    return data
  }

  const saveWorldsToDisk = async (worldsToSave: World[]) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) {
      throw new Error("Missing auth token")
    }

    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: worldsToSave,
        listId: uploadListId || null,
        listName: listNameForUpload,
        positions: worldsToSave.reduce<Record<string, number>>((acc, world, index) => {
          acc[world.id] = index
          return acc
        }, {}),
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const details = data?.details ? `: ${data.details}` : ""
      throw new Error(`${data?.error ?? "Save failed"}${details}`)
    }
  }

  const loadSupabaseState = async () => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return

    const response = await fetch("/api/storage/worlds/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      return
    }
    const data = await response.json()
    const lists = Array.isArray(data?.lists) ? data.lists : []
    const worlds = Array.isArray(data?.worlds) ? data.worlds : []

    if (lists.length > 0) {
      const sortedLists = [...lists].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const listMap = new Map<string, { id: string; name: string; worldIds: string[] }>()
      sortedLists.forEach((list) => {
        listMap.set(list.id, { id: list.id, name: list.name, worldIds: [] })
      })

      const listWorldsMap = new Map<string, Array<{ worldId: string; position: number }>>()
      worlds.forEach((world) => {
        if (world.listId && listMap.has(world.listId)) {
          const arr = listWorldsMap.get(world.listId) ?? []
          arr.push({ worldId: world.worldId, position: world.position ?? 0 })
          listWorldsMap.set(world.listId, arr)
        }
      })

      listMap.forEach((list, id) => {
        const entries = listWorldsMap.get(id) ?? []
        entries.sort((a, b) => a.position - b.position)
        list.worldIds = entries.map((entry) => entry.worldId)
      })

      setWorldLists(Array.from(listMap.values()))
    }

    if (worlds.length > 0) {
      const loadedWorlds = worlds.map((world) => world.json).filter(Boolean)
      setUploadedWorlds(loadedWorlds)

      const overrides: Record<string, string> = {}
      worlds.forEach((world) => {
        if (world.title && world.json?.title && world.title !== world.json.title) {
          overrides[world.worldId] = world.title
        }
      })
      if (Object.keys(overrides).length > 0) {
        setWorldTitleOverrides((prev) => ({ ...prev, ...overrides }))
      }

      const hidden = worlds.filter((world) => world.hidden).map((world) => world.worldId)
      if (hidden.length > 0) {
        setHiddenWorldIds((prev) => Array.from(new Set([...prev, ...hidden])))
      }
    }

    setIsSupabaseLoaded(true)
  }

  const syncSupabaseState = async () => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return

    const listPayload = worldLists.map((list, index) => ({
      id: list.id,
      name: list.name,
      position: index,
    }))

    const worldPayload = uploadedWorlds.map((world) => {
      const listEntry = worldLists.find((list) => list.worldIds.includes(world.id))
      const position = listEntry
        ? listEntry.worldIds.indexOf(world.id)
        : uploadedWorlds.findIndex((w) => w.id === world.id)
      return {
        worldId: world.id,
        title: getWorldTitle(world.id, world.title),
        listId: listEntry?.id ?? null,
        position,
        hidden: hiddenWorldIds.includes(world.id),
      }
    })

    await fetch("/api/storage/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lists: listPayload, worlds: worldPayload }),
    })
  }

  const persistWorlds = async (worldsToPersist: World[], activeWorldId?: string) => {
    setUploadedWorlds((prev) => {
      const next = [...prev]
      worldsToPersist.forEach((world) => {
        const existingIndex = next.findIndex((item) => item.id === world.id)
        if (existingIndex >= 0) {
          next[existingIndex] = world
        } else {
          next.push(world)
        }
      })
      return next
    })
    if (uploadListId) {
      worldsToPersist.forEach((world) => {
        const alreadyAssigned = worldLists.some((list) => list.worldIds.includes(world.id))
        if (!alreadyAssigned) {
          assignWorldToList(world.id, uploadListId)
        }
      })
    }
    const firstId = activeWorldId ?? worldsToPersist[0]?.id
    if (firstId) {
      setWorldId(firstId)
      setLevelIndex(0)
      setGameSeed((s) => s + 1)
    }
    await saveWorldsToDisk(worldsToPersist)
  }

  const openUpload = () => {
    resetUploadState()
    setIsUploadOpen(true)
    setIsMenuOpen(false)
  }

  const handleChangeUploadTab = (value: UploadTab) => {
    setUploadTab(value)
    if (value === "json") {
      setUploadTargetWorldId("new")
    }
  }

  const submitUpload = async () => {
    setUploadError(null)
    setIsProcessingUpload(true)
    try {
      if (uploadTab === "json") {
        if (uploadTargetWorldId !== "new") {
          setUploadError("El JSON crea un mundo nuevo. Selecciona 'Nuevo mundo'.")
          return
        }
        if (!uploadText.trim()) {
          setUploadError(ui.upload.errorNoInput)
          return
        }
        const parsed = JSON.parse(uploadText)
        const normalized = normalizeUploadedWorld(parsed, uploadName)
        if (!normalized) {
          setUploadError(ui.upload.errorInvalidList)
          return
        }
        await persistWorlds([normalized], normalized.id)
        setIsUploadOpen(false)
        return
      }
    } catch (error) {
      setUploadError((error as Error).message || ui.upload.errorInvalidJson)
      return
    } finally {
      setIsProcessingUpload(false)
    }
  }

  const tableRowsToText = () =>
    tableRows
      .map((row) => [row.source.trim(), row.target.trim()].filter(Boolean).join("\t"))
      .filter(Boolean)
      .join("\n")

  const normalizeText = (value: unknown) =>
    typeof value === "string" ? value.trim() : ""
  const normalizePos = (value: unknown): ReviewItem["pos"] =>
    value === "verb" || value === "noun" || value === "adj" ? value : "other"
  const normalizeEmoji = (value: unknown) => {
    if (typeof value !== "string") return "📝"
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : "📝"
  }

  const buildReviewItemsFromAi = (items: any[]) =>
    items.map((item, index) => {
      const pos = normalizePos(item?.pos)
      return {
        id: `review-${Date.now()}-${index}`,
        source: normalizeText(item?.source),
        target: normalizeText(item?.target),
        pos,
        lemma: normalizeText(item?.lemma) || undefined,
        emoji: normalizeEmoji(item?.emoji),
        include: true,
        conjugate: pos === "verb",
      } as ReviewItem
    })

  const updateTableRow = (index: number, value: { source?: string; target?: string }) => {
    setTableRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...value } : row))
      const last = next[next.length - 1]
      if (last && (last.source.trim() || last.target.trim())) {
        next.push({ source: "", target: "" })
      }
      return next
    })
  }

  const buildReviewItemsFromTable = (rows: Array<{ source: string; target: string }>) =>
    rows
      .filter((row) => row.source.trim() || row.target.trim())
      .map((row, index) => ({
        id: `review-table-${Date.now()}-${index}`,
        source: row.source.trim(),
        target: row.target.trim(),
        pos: "other",
        emoji: "📝",
        include: true,
        conjugate: false,
      })) as ReviewItem[]

  const autoCompleteTableRows = async () => {
    const currentRows = tableRows
    const trimmedRows = currentRows.filter((row) => row.source.trim() || row.target.trim())
    if (trimmedRows.length === 0) {
      setUploadError(ui.upload.errorNoInput)
      return null
    }
    const missingTarget = trimmedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.source.trim() && !row.target.trim())
    const missingSource = trimmedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.target.trim() && !row.source.trim())

    const desiredMode = uploadModeSelection === "auto" ? null : uploadModeSelection
    let next = [...currentRows]

    if (missingTarget.length > 0) {
      const text = missingTarget.map(({ row }) => row.source.trim()).join("\n")
      const result = await callAi({
        task: "parse_text",
        text,
        mode: desiredMode,
        sourceLabel: ui.upload.tableSource,
        targetLabel: ui.upload.tableTarget,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length === 0) {
        setUploadError(ui.upload.errorNoItems)
        return null
      }
      missingTarget.forEach(({ index }, i) => {
        const item = items[i]
        const target = normalizeText(item?.target)
        next[index] = { ...next[index], target }
      })
    }

    if (missingSource.length > 0) {
      const text = missingSource.map(({ row }) => row.target.trim()).join("\n")
      const result = await callAi({
        task: "parse_text",
        text,
        mode: desiredMode,
        sourceLabel: ui.upload.tableTarget,
        targetLabel: ui.upload.tableSource,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length === 0) {
        setUploadError(ui.upload.errorNoItems)
        return null
      }
      missingSource.forEach(({ index }, i) => {
        const item = items[i]
        const source = normalizeText(item?.target)
        next[index] = { ...next[index], source }
      })
    }

    // Enrich rows with emoji + POS + corrected casing
    const rowsForEnrich = next
      .map((row) => ({ source: row.source.trim(), target: row.target.trim() }))
      .filter((row) => row.source || row.target)
    let enrichedItems: ReviewItem[] = []
    if (rowsForEnrich.length > 0) {
      const allText = rowsForEnrich
        .map((row) => [row.source, row.target].filter(Boolean).join(" — "))
        .join("\n")
      const result = await callAi({
        task: "parse_text",
        text: allText,
        mode: desiredMode,
        sourceLabel: ui.upload.tableSource,
        targetLabel: ui.upload.tableTarget,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length > 0) {
        enrichedItems = buildReviewItemsFromAi(items)
        next = next.map((row, index) => {
          const item = items[index]
          const source = normalizeText(item?.source) || row.source.trim()
          const target = normalizeText(item?.target) || row.target.trim()
          return { source, target }
        })
      }
    }

    const last = next[next.length - 1]
    if (last && (last.source.trim() || last.target.trim())) {
      next.push({ source: "", target: "" })
    }
    setTableRows(next)
    return {
      rows: next,
      items: enrichedItems.length > 0 ? enrichedItems : buildReviewItemsFromTable(next),
    }
  }

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ""
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    return btoa(binary)
  }

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    if (imageUpload?.previewUrl) {
      URL.revokeObjectURL(imageUpload.previewUrl)
    }
    setImageUpload(null)
    const text = await file.text()
    setFileUploadText(text)
    setFileUploadName(file.name)
  }

  const handleImageUpload = async (file: File | null) => {
    if (!file) return
    if (imageUpload?.previewUrl) {
      URL.revokeObjectURL(imageUpload.previewUrl)
    }
    setFileUploadText("")
    setFileUploadName("")
    const buffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const previewUrl = URL.createObjectURL(file)
    setImageUpload({ data: base64, mimeType: file.type, previewUrl })
  }

  const handleGeneratePreview = async () => {
    setUploadError(null)
    setIsProcessingUpload(true)
    try {
      const desiredMode = uploadModeSelection === "auto" ? null : uploadModeSelection
      if (uploadTab === "table") {
        const result = await autoCompleteTableRows()
        if (!result) return
        const items = result.items
        if (items.length === 0) {
          setUploadError(ui.upload.errorNoItems)
          return
        }
        setReviewMode(uploadModeSelection === "conjugation" ? "conjugation" : "vocab")
        setReviewItems(items)
        setUploadStep("review")
        return
      }

      if (uploadTab === "theme") {
        if (!themeText.trim()) {
          setUploadError(ui.upload.errorNoInput)
          return
        }
        const result = await callAi({
          task: "theme_list",
          theme: themeText,
          count: themeCount,
          level: themeLevel,
          mode: desiredMode,
          sourceLabel: ui.upload.tableSource,
          targetLabel: ui.upload.tableTarget,
        })
        const items = Array.isArray(result?.items) ? result.items : []
        if (items.length === 0) {
          setUploadError(ui.upload.errorNoItems)
          return
        }
        const mode =
          uploadModeSelection === "auto" && result?.mode === "conjugation"
            ? "conjugation"
            : uploadModeSelection === "conjugation"
              ? "conjugation"
              : "vocab"
        startReview(buildReviewItemsFromAi(items), mode)
        return
      }

      if (uploadTab === "upload") {
        if (imageUpload) {
          const result = await callAi({
            task: "parse_image",
            image: { data: imageUpload.data, mimeType: imageUpload.mimeType },
            mode: desiredMode,
            sourceLabel: ui.upload.tableSource,
            targetLabel: ui.upload.tableTarget,
          })
          const items = Array.isArray(result?.items) ? result.items : []
          if (items.length === 0) {
            setUploadError(ui.upload.errorNoItems)
            return
          }
          const mode =
            uploadModeSelection === "auto" && result?.mode === "conjugation"
              ? "conjugation"
              : uploadModeSelection === "conjugation"
                ? "conjugation"
                : "vocab"
          startReview(buildReviewItemsFromAi(items), mode)
          return
        }

        if (!fileUploadText.trim()) {
          setUploadError(ui.upload.errorNoInput)
          return
        }
        const result = await callAi({
          task: "parse_text",
          text: fileUploadText,
          mode: desiredMode,
          sourceLabel: ui.upload.tableSource,
          targetLabel: ui.upload.tableTarget,
        })
        const items = Array.isArray(result?.items) ? result.items : []
        if (items.length === 0) {
          setUploadError(ui.upload.errorNoItems)
          return
        }
        const mode =
          uploadModeSelection === "auto" && result?.mode === "conjugation"
            ? "conjugation"
            : uploadModeSelection === "conjugation"
              ? "conjugation"
              : "vocab"
        startReview(buildReviewItemsFromAi(items), mode)
      }
    } catch (error) {
      setUploadError((error as Error).message)
    } finally {
      setIsProcessingUpload(false)
    }
  }

  const buildVocabPoolFromItems = (items: ReviewItem[], idPrefix: string) =>
    items.map((item, index) => ({
      id: `${idPrefix}-${index}-${item.source}`,
      es: item.source,
      de: item.target,
      image: { type: "emoji", value: item.emoji?.trim() || "📝" },
      pos: item.pos,
      explanation: `Auto: ${item.source} → ${item.target}`,
    }))

  const buildVocabWorld = (items: ReviewItem[]): World => {
    const id = `upload-${Date.now()}`
    const title = uploadName.trim() || "Uploaded list"
    return {
      id,
      title,
      description: `Lista personalizada: ${title}`,
      mode: "vocab",
      pool: buildVocabPoolFromItems(items, id),
      chunking: { mode: "sequential", itemsPerGame: 8 },
      ui: {
        header: {
          levelLabelTemplate: "Nivel {i}/{n}",
          levelItemTemplate: "Nivel {i}",
        },
        page: {
          instructions: "Empareja las palabras en español con las palabras en alemán.",
        },
        vocab: {
          progressTemplate: "Progreso: {matched}/{total} • Movimientos: {moves}",
          carousel: { primaryLabel: "Español:", secondaryLabel: "Deutsch:" },
          rightPanel: { title: "Parejas encontradas", emptyHint: "Encuentra una pareja para empezar." },
        },
        winning: {
          title: "Lo has logrado 🎉",
          movesLabel: "Movimientos:",
          explanationTitle: "Explicación",
          reviewTitle: "Revisión",
          conjugationTitle: "Conjugación",
          nextDefault: "Siguiente",
          closeDefault: "Cerrar",
        },
      },
    } as World
  }

  const buildConjugationWorld = (conjugations: any[]): World => {
    const id = `upload-${Date.now()}-conjugation`
    const conjugationMap: Record<string, any> = {}
    const pool: Array<any> = []

    conjugations.forEach((entry) => {
      const verb = entry?.verb
      if (!verb) return
      const sections = Array.isArray(entry?.sections) ? entry.sections : []
      const translation = typeof entry?.translation === "string" ? entry.translation : ""
      conjugationMap[verb] = {
        infinitive: verb,
        translation,
        sections,
      }
      const firstSection = sections[0]
      const rows = Array.isArray(firstSection?.rows) ? firstSection.rows : []
      rows.forEach((row: any, idx: number) => {
        if (!Array.isArray(row) || row.length < 2) return
        pool.push({
          id: `${verb}_${idx + 1}`,
          es: row[0],
          de: row[1],
          image: { type: "emoji", value: "📝" },
        })
      })
    })

    return {
      id,
      title: `${uploadName.trim() || "Uploaded list"} ${ui.conjugationWorld.titleSuffix}`,
      description: "Custom conjugation list.",
      mode: "vocab",
      submode: "conjugation",
      pool,
      conjugations: conjugationMap,
      chunking: { mode: "sequential", itemsPerGame: 6 },
      ui: {
        header: { levelLabelTemplate: "{verb}", levelItemTemplate: "{verb}" },
        page: { instructions: ui.conjugationWorld.instructions },
        vocab: {
          carousel: {
            primaryLabel: ui.conjugationWorld.primaryLabel,
            secondaryLabel: ui.conjugationWorld.secondaryLabel,
          },
          rightPanel: {
            title: ui.conjugationWorld.rightTitle,
            emptyHint: ui.conjugationWorld.emptyHint,
          },
        },
      },
    } as World
  }

  const submitReview = async () => {
    setUploadError(null)
    const included = reviewItems.filter(
      (item) => item.include && item.source.trim() && item.target.trim()
    )
    if (!included.length) {
      setUploadError(ui.upload.errorNoItems)
      return
    }

    setIsProcessingUpload(true)
    try {
      const worldsToSave: World[] = []
      let activeId: string | undefined = undefined

      if (reviewMode === "vocab") {
        const appendTargetId = uploadTargetWorldId !== "new" ? uploadTargetWorldId : ""
        if (appendTargetId) {
          const target = allWorlds.find(
            (world) => world.id === appendTargetId && world.mode === "vocab" && world.submode !== "conjugation"
          )
          if (!target) {
            setUploadError(ui.upload.errorNoItems)
            return
          }
          const pool = buildVocabPoolFromItems(included, `append-${Date.now()}`)
          if (uploadedWorldIdSet.has(target.id)) {
            const updatedWorld = {
              ...target,
              pool: [...(target.pool ?? []), ...pool],
            } as World
            worldsToSave.push(updatedWorld)
            activeId = updatedWorld.id
          } else {
            const extendedId = `extended-${target.id}-${Date.now()}`
            const extendedTitle = `${target.title} + ${uploadName.trim() || "Extensión"}`
            const extendedWorld = {
              ...target,
              id: extendedId,
              title: extendedTitle,
              description: `Lista extendida: ${target.title}`,
              pool: [...(target.pool ?? []), ...pool],
            } as World
            worldsToSave.push(extendedWorld)
            activeId = extendedWorld.id
          }
        } else {
          const vocabWorld = buildVocabWorld(included)
          worldsToSave.push(vocabWorld)
          activeId = vocabWorld.id
        }
      }

      const verbsForConjugation = included
        .filter((item) => item.pos === "verb" && (reviewMode === "conjugation" || item.conjugate))
        .map((item) => ({
          lemma: item.lemma?.trim() || item.target,
          translation: item.source,
        }))
        .filter((item) => item.lemma)

      if (reviewMode === "conjugation" && verbsForConjugation.length === 0) {
        setUploadError(ui.upload.errorNoVerbs)
        return
      }

      if (verbsForConjugation.length > 0) {
        const result = await callAi({
          task: "conjugate",
          verbs: verbsForConjugation,
          sourceLabel: ui.upload.tableSource,
          targetLabel: ui.upload.tableTarget,
        })
        const conjugations = Array.isArray(result?.conjugations) ? result.conjugations : []
        const conjugationWorld = buildConjugationWorld(conjugations)
        worldsToSave.push(conjugationWorld)
        if (reviewMode === "conjugation") {
          activeId = conjugationWorld.id
        }
      }

      if (worldsToSave.length === 0) {
        setUploadError(ui.upload.errorNoItems)
        return
      }

      await persistWorlds(worldsToSave, activeId)
      setIsUploadOpen(false)
    } catch (error) {
      setUploadError((error as Error).message)
    } finally {
      setIsProcessingUpload(false)
    }
  }

  const reviewFromTable = async () => {
    setUploadError(null)
    const result = await autoCompleteTableRows()
    if (!result || result.items.length === 0) {
      setUploadError(ui.upload.errorNoItems)
      return
    }
    const items = result.items
    setReviewMode(uploadModeSelection === "conjugation" ? "conjugation" : "vocab")
    setReviewItems(items)
    setUploadStep("review")
  }

  const restart = () => {
    setGameSeed((s) => s + 1)
  }

  const nextLevel = () => {
    setLevelIndex((i) => {
        const next = i + 1
        return next >= levelsCount ? 0 : next // wrap to level 0 (or clamp if you prefer)
    })
    setGameSeed((s) => s + 1) // force remount so the game resets cleanly
    }
    const headerInstructions =
        currentWorld.ui?.page?.instructions ??
        currentWorld.description ??
        (currentWorld.mode === "vocab"
            ? "Empareja las palabras en español con las palabras en alemán."
            : "Construye la frase en el orden correcto.")

    const currentChunk = useMemo(() => {
    const k = currentWorld.chunking.itemsPerGame
    const start = Math.min(levelIndex, levelsCount - 1) * k
    return currentWorld.pool.slice(start, start + k)
    }, [currentWorld, levelIndex, levelsCount])

    const chunkVerb = useMemo(() => {
    if (currentWorld.mode !== "vocab") return ""
    const first = currentChunk[0]
    if (!first) return ""
    // types: VocabPair has id + es, safe here because mode === "vocab"
    return extractVerbLabelFromPair(first as any)
    }, [currentWorld.mode, currentChunk])
    
    const levelLabelTemplate =
    currentWorld.ui?.header?.levelLabelTemplate ?? "Nivel {i}/{n}"
    const currentVerb =
    currentWorld.mode === "vocab"
        ? extractVerbLabelFromPair(
            (currentWorld.pool[Math.min(levelIndex, levelsCount - 1) * currentWorld.chunking.itemsPerGame] as any)
        )
        : ""

    const levelLabel = formatTemplate(levelLabelTemplate, {
    i: safeLevel,
    n: levelsCount,
    verb: currentVerb,
    })

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-3 sm:p-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-12 gap-4 items-start md:grid-rows-[auto,1fr]">
          {/* MOBILE TOP BAR */}
          <div className="col-span-12 md:hidden">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="h-10 w-10 rounded-full border border-neutral-800 bg-neutral-900/60 text-lg"
                aria-label="Menú"
              >
                ☰
              </button>
              <div className="text-center flex-1">
                <div className="text-2xl font-semibold tracking-tight">
                  voc<span className="text-green-500">ado</span>
                </div>
                <div className="text-xs text-neutral-300 mt-1">
                  {worldTitle} — {levelLabel}
                </div>
              </div>
              <UserMenu />
            </div>
          </div>

          {/* DESKTOP LEFT MENU */}
          <aside className="hidden md:block md:col-span-2 md:row-span-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
              <button
                type="button"
                onClick={() => setIsMenuOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm"
              >
                ☰ {ui.menu.title}
              </button>

              {isMenuOpen && (
                <div className="mt-3 space-y-2 text-sm text-neutral-200">
                  <button
                    type="button"
                    onClick={openWorlds}
                    className="block w-full text-left hover:text-white"
                  >
                    {ui.menu.worlds}
                  </button>
                  <button
                    type="button"
                    onClick={openUpload}
                    className="block w-full text-left hover:text-white"
                  >
                    {ui.menu.upload}
                  </button>
                  <button className="block w-full text-left hover:text-white">
                    {ui.menu.manage}
                  </button>
                  <button className="block w-full text-left hover:text-white">
                    {ui.menu.locked}
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* CENTER HEADER */}
          <div className="col-span-12 md:col-span-10 md:col-start-3 md:row-start-1">
            <div className="w-full">
              <div className="hidden md:flex items-end justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">
                    voc<span className="text-green-500">ado</span>
                  </h1>
                  <div className="mt-1 text-sm text-neutral-300">
                    {worldTitle} — {levelLabel}
                  </div>
                  <p className="text-sm text-neutral-300 mt-1">
                    {headerInstructions}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={restart} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    {ui.menu.restart}
                  </Button>
                  <UserMenu />
                </div>
              </div>
            </div>
          </div>

          {/* GAME AREA */}
          <div className="col-span-12 md:col-span-10 md:col-start-3 md:row-start-2 space-y-3">
            <div className="flex items-center justify-between md:hidden">
              <div className="text-xs text-neutral-300">{headerInstructions}</div>
              <Button onClick={restart} className="flex items-center gap-2 text-xs px-2 py-1">
                <RotateCcw className="w-3 h-3" />
                {ui.menu.restart}
              </Button>
            </div>
            {currentWorld.mode === "vocab" ? (
              <VocabMemoryGame
                key={`${worldId}:${levelIndex}:${gameSeed}`}
                world={currentWorld}
                levelIndex={Math.min(levelIndex, levelsCount - 1)}
                onNextLevel={nextLevel}
              />
            ) : (
              <PhraseMemoryGame
                key={`${worldId}:${levelIndex}:${gameSeed}`}
                world={currentWorld}
                levelIndex={Math.min(levelIndex, levelsCount - 1)}
                onNextLevel={nextLevel}
              />
            )}
          </div>
        </div>
      </div>

      {/* MOBILE MENU OVERLAY */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[72vw] max-w-[320px] bg-neutral-950 border-r border-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{ui.menu.title}</div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-200"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-neutral-200">
              <button
                type="button"
                onClick={() => {
                  openWorlds()
                  setIsMenuOpen(false)
                }}
                className="block w-full text-left hover:text-white"
              >
                {ui.menu.worlds}
              </button>
              <button
                type="button"
                onClick={() => {
                  openUpload()
                  setIsMenuOpen(false)
                }}
                className="block w-full text-left hover:text-white"
              >
                {ui.menu.upload}
              </button>
              <button className="block w-full text-left hover:text-white">
                {ui.menu.manage}
              </button>
              <button className="block w-full text-left hover:text-white">
                {ui.menu.locked}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORLDS OVERLAY */}
      <AnimatePresence>
        {isWorldsOpen && (
          <WorldsOverlay
            worlds={visibleWorlds}
            lists={worldLists}
            collapsedListIds={collapsedListIds}
            onSetCollapsedListIds={setCollapsedListIds}
            newListName={newListName}
            onChangeNewListName={setNewListName}
            onCreateList={createList}
            onAssignWorldToList={assignWorldToList}
            onMoveWorldInList={moveWorldInList}
            onRenameWorld={renameWorld}
            onRenameList={renameList}
            getWorldTitle={getWorldTitle}
            onMoveList={moveList}
            onHideWorld={hideWorld}
            activeWorldId={worldId}
            onClose={() => setIsWorldsOpen(false)}
            onSelectWorld={(id) => {
              setPendingWorldId(id)
              setIsWorldsOpen(false)
              setIsLevelsOpen(true)
            }}
          />
        )}
      </AnimatePresence>

      {/* UPLOAD OVERLAY */}
      <AnimatePresence>
        {isUploadOpen && (
          <UploadOverlay
            name={uploadName}
            text={uploadText}
            error={uploadError}
            lists={worldLists}
            selectedListId={uploadListId}
            targetWorldId={uploadTargetWorldId}
            appendableWorlds={appendableWorlds}
            hiddenWorlds={allWorlds
              .filter((w) => hiddenWorldIds.includes(w.id))
              .map((w) => ({ id: w.id, title: getWorldTitle(w.id, w.title) }))}
            tab={uploadTab}
            step={uploadStep}
            modeSelection={uploadModeSelection}
            tableRows={tableRows}
            fileName={fileUploadName}
            imagePreviewUrl={imageUpload?.previewUrl ?? ""}
            reviewItems={reviewItems}
            isProcessing={isProcessingUpload}
            themeText={themeText}
            themeCount={themeCount}
            themeLevel={themeLevel}
            onChangeName={setUploadName}
            onChangeText={setUploadText}
            onChangeTab={handleChangeUploadTab}
            onChangeModeSelection={setUploadModeSelection}
            onChangeTargetWorldId={setUploadTargetWorldId}
            onChangeThemeText={setThemeText}
            onChangeThemeCount={setThemeCount}
            onChangeThemeLevel={setThemeLevel}
            onUpdateTableRow={updateTableRow}
            onAddTableRow={() =>
              setTableRows((prev) => [...prev, { source: "", target: "" }])
            }
            onRemoveTableRow={(index) =>
              setTableRows((prev) => prev.filter((_, i) => i !== index))
            }
            onFileUpload={handleFileUpload}
            onImageUpload={handleImageUpload}
            onGeneratePreview={handleGeneratePreview}
            onReviewFromTable={reviewFromTable}
            onBackToInput={() => setUploadStep("input")}
            onUpdateReviewItem={(id, value) =>
              setReviewItems((prev) =>
                prev.map((item) => (item.id === id ? { ...item, ...value } : item))
              )
            }
            onAddReviewItem={() =>
              setReviewItems((prev) => [
                ...prev,
                {
                  id: `review-${Date.now()}`,
                  source: "",
                  target: "",
                  pos: "other",
                  include: true,
                  conjugate: false,
                },
              ])
            }
            onRemoveReviewItem={(id) =>
              setReviewItems((prev) => prev.filter((item) => item.id !== id))
            }
            onOpenListPicker={() => setIsListPickerOpen(true)}
            onRestoreWorld={restoreWorld}
            onClose={() => setIsUploadOpen(false)}
            onSubmit={submitUpload}
            onSubmitReview={submitReview}
          />
        )}
      </AnimatePresence>

      {/* LIST PICKER OVERLAY */}
      <AnimatePresence>
        {isListPickerOpen && (
          <ListPickerOverlay
            lists={worldLists}
            selectedListId={uploadListId}
            newListName={listPickerName}
            onChangeNewListName={setListPickerName}
            onSelectList={(id) => {
              setUploadListId(id)
              setIsListPickerOpen(false)
            }}
            onCreateList={() => {
              const id = addList(listPickerName)
              if (id) {
                setUploadListId(id)
              }
              setListPickerName("")
              setIsListPickerOpen(false)
            }}
            onClose={() => setIsListPickerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* LEVELS OVERLAY */}
      <AnimatePresence>
        {isLevelsOpen && pendingWorldId && (
          <LevelsOverlay
            world={visibleWorlds.find((w) => w.id === pendingWorldId)!}
            displayTitle={getWorldTitle(
              pendingWorldId,
              visibleWorlds.find((w) => w.id === pendingWorldId)?.title ?? ""
            )}
            activeLevelIndex={pendingWorldId === worldId ? levelIndex : -1}
            onClose={() => {
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
            onSelectLevel={(idx) => {
              // order matters: set world, then level, then restart game
              setWorldId(pendingWorldId)
              setLevelIndex(idx)
              setGameSeed((s) => s + 1)
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function UploadOverlay({
  name,
  text,
  error,
  lists,
  selectedListId,
  targetWorldId,
  appendableWorlds,
  onOpenListPicker,
  hiddenWorlds,
  tab,
  step,
  modeSelection,
  tableRows,
  fileName,
  imagePreviewUrl,
  reviewItems,
  isProcessing,
  themeText,
  themeCount,
  themeLevel,
  themeText,
  themeCount,
  themeLevel,
  onChangeName,
  onChangeText,
  onChangeTab,
  onChangeModeSelection,
  onChangeTargetWorldId,
  onChangeThemeText,
  onChangeThemeCount,
  onChangeThemeLevel,
  onChangeThemeText,
  onChangeThemeCount,
  onChangeThemeLevel,
  onUpdateTableRow,
  onAddTableRow,
  onRemoveTableRow,
  onFileUpload,
  onImageUpload,
  onGeneratePreview,
  onReviewFromTable,
  onBackToInput,
  onUpdateReviewItem,
  onAddReviewItem,
  onRemoveReviewItem,
  onRestoreWorld,
  onClose,
  onSubmit,
  onSubmitReview,
}: {
  name: string
  text: string
  error: string | null
  lists: WorldList[]
  selectedListId: string
  targetWorldId: string
  appendableWorlds: Array<{ id: string; title: string; isUploaded: boolean }>
  onOpenListPicker: () => void
  hiddenWorlds: Array<{ id: string; title: string }>
  tab: UploadTab
  step: "input" | "review"
  modeSelection: UploadModeSelection
  tableRows: Array<{ source: string; target: string }>
  fileName: string
  imagePreviewUrl: string
  reviewItems: ReviewItem[]
  isProcessing: boolean
  themeText: string
  themeCount: number
  themeLevel: string
  onChangeName: (value: string) => void
  onChangeText: (value: string) => void
  onChangeTab: (value: UploadTab) => void
  onChangeModeSelection: (value: UploadModeSelection) => void
  onChangeTargetWorldId: (value: string) => void
  onChangeThemeText: (value: string) => void
  onChangeThemeCount: (value: number) => void
  onChangeThemeLevel: (value: string) => void
  onUpdateTableRow: (index: number, value: { source?: string; target?: string }) => void
  onAddTableRow: () => void
  onRemoveTableRow: (index: number) => void
  onFileUpload: (file: File | null) => void
  onImageUpload: (file: File | null) => void
  onGeneratePreview: () => void
  onReviewFromTable: () => void
  onBackToInput: () => void
  onUpdateReviewItem: (id: string, value: Partial<ReviewItem>) => void
  onAddReviewItem: () => void
  onRemoveReviewItem: (id: string) => void
  onRestoreWorld: (id: string) => void
  onClose: () => void
  onSubmit: () => void
  onSubmitReview: () => void
}) {
  const selectedTarget = appendableWorlds.find((world) => world.id === targetWorldId)
  const isAppendingExisting = Boolean(selectedTarget?.isUploaded)
  const tabs: Array<{ id: UploadTab; label: string }> = [
    { id: "table", label: ui.upload.tabTable },
    { id: "upload", label: ui.upload.tabUpload },
    { id: "theme", label: ui.upload.tabTheme },
    { id: "json", label: ui.upload.tabJson },
  ]

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-neutral-800 p-4 sm:p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
              {ui.upload.title}
            </h2>
            <p className="text-sm text-neutral-300 mt-2">
              {ui.upload.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        {step === "review" ? (
          <>
            <div className="mt-5 text-lg font-semibold text-neutral-100">
              {ui.upload.reviewTitle}
            </div>
            <div className="mt-2 text-sm text-neutral-300">{ui.upload.reviewHint}</div>
            <div className="mt-4 overflow-auto max-h-[45vh] rounded-xl border border-neutral-800">
              <div className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,auto] gap-2 p-3 text-xs uppercase tracking-wide text-neutral-400">
                <div>{ui.upload.reviewInclude}</div>
                <div>{ui.upload.reviewSource}</div>
                <div>{ui.upload.reviewTarget}</div>
                <div>{ui.upload.reviewEmoji}</div>
                <div>{ui.upload.reviewPos}</div>
                <div>{ui.upload.reviewConjugate}</div>
                <div></div>
              </div>
              <div className="divide-y divide-neutral-800">
                {reviewItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,auto] gap-2 p-3 items-center"
                  >
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { include: e.target.checked })
                      }
                    />
                    <input
                      type="text"
                      value={item.source}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { source: e.target.value })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                    />
                    <input
                      type="text"
                      value={item.target}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { target: e.target.value })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                    />
                    <input
                      type="text"
                      value={item.emoji ?? ""}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { emoji: e.target.value })
                      }
                      className="w-12 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-center text-sm text-neutral-100"
                    />
                    <select
                      value={item.pos}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, {
                          pos: e.target.value as ReviewItem["pos"],
                          conjugate: e.target.value === "verb" ? item.conjugate : false,
                        })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                    >
                      <option value="verb">{ui.upload.posVerb}</option>
                      <option value="noun">{ui.upload.posNoun}</option>
                      <option value="adj">{ui.upload.posAdj}</option>
                      <option value="other">{ui.upload.posOther}</option>
                    </select>
                    <input
                      type="checkbox"
                      checked={item.conjugate}
                      disabled={item.pos !== "verb"}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { conjugate: e.target.checked })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveReviewItem(item.id)}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onAddReviewItem}
              className="mt-3 text-sm text-neutral-300 hover:text-white"
            >
              {ui.upload.reviewAddRow}
            </button>

            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onBackToInput}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
              >
                {ui.upload.reviewBack}
              </button>
              <button
                type="button"
                onClick={onSubmitReview}
                disabled={isProcessing}
                className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
              >
                {isProcessing ? ui.upload.processing : ui.upload.reviewDone}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.nameLabel}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => onChangeName(e.target.value)}
                    placeholder={ui.upload.namePlaceholder}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.listLabel}</label>
                  <button
                    type="button"
                    onClick={onOpenListPicker}
                    disabled={isAppendingExisting}
                    className={[
                      "mt-2 w-full rounded-lg border px-3 py-2 text-left text-sm",
                      isAppendingExisting
                        ? "border-neutral-800 bg-neutral-900/40 text-neutral-500 cursor-not-allowed"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-100",
                    ].join(" ")}
                  >
                    {selectedListId
                      ? lists.find((list) => list.id === selectedListId)?.name ?? ui.worldsOverlay.unlisted
                      : ui.worldsOverlay.unlisted}
                  </button>
                </div>
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.modeLabel}</label>
                  <select
                    value={modeSelection}
                    onChange={(e) => onChangeModeSelection(e.target.value as UploadModeSelection)}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                  >
                    <option value="auto">{ui.upload.modeAuto}</option>
                    <option value="vocab">{ui.upload.modeVocab}</option>
                    <option value="conjugation">{ui.upload.modeConjugation}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.destinationLabel}</label>
                  <select
                    value={targetWorldId}
                    onChange={(e) => onChangeTargetWorldId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                  >
                    <option value="new">{ui.upload.destinationNew}</option>
                    {appendableWorlds.map((world) => (
                      <option key={world.id} value={world.id}>
                        {world.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {tabs.map((tabItem) => (
                  <button
                    key={tabItem.id}
                    type="button"
                    onClick={() => onChangeTab(tabItem.id)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm",
                      tab === tabItem.id
                        ? "border-neutral-200 text-white"
                        : "border-neutral-800 text-neutral-300 hover:text-white",
                    ].join(" ")}
                  >
                    {tabItem.label}
                  </button>
                ))}
              </div>

              {hiddenWorlds.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-neutral-400">
                    {ui.upload.hiddenWorldsTitle}
                  </div>
                  <div className="mt-2 space-y-2">
                    {hiddenWorlds.map((w) => (
                      <div key={w.id} className="flex items-center justify-between gap-3">
                        <div className="text-sm text-neutral-200">{w.title}</div>
                        <button
                          type="button"
                          onClick={() => onRestoreWorld(w.id)}
                          className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                        >
                          {ui.upload.restoreWorld}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "json" && (
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.jsonLabel}</label>
                  <textarea
                    value={text}
                    onChange={(e) => onChangeText(e.target.value)}
                    rows={10}
                    placeholder={ui.upload.jsonPlaceholder}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                  />
                </div>
              )}

              {tab === "table" && (
                <div>
                  <div className="grid grid-cols-2 gap-2 text-xs uppercase tracking-wide text-neutral-400">
                    <div>{ui.upload.tableSource}</div>
                    <div>{ui.upload.tableTarget}</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {tableRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                        <input
                          type="text"
                          value={row.source}
                          onChange={(e) =>
                            onUpdateTableRow(index, { source: e.target.value })
                          }
                          className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                        />
                        <input
                          type="text"
                          value={row.target}
                          onChange={(e) =>
                            onUpdateTableRow(index, { target: e.target.value })
                          }
                          className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveTableRow(index)}
                          className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-2 text-xs text-neutral-200"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onAddTableRow}
                    className="mt-3 text-sm text-neutral-300 hover:text-white"
                  >
                    {ui.upload.tableAddRow}
                  </button>
                  <div className="mt-2 text-xs text-neutral-400">{ui.upload.tableHint}</div>
                </div>
              )}

              {tab === "theme" && (
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.themeLabel}</label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr,120px,120px]">
                    <input
                      type="text"
                      value={themeText}
                      onChange={(e) => onChangeThemeText(e.target.value)}
                      placeholder={ui.upload.themePlaceholder}
                      className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                    />
                    <div>
                      <label className="text-xs text-neutral-400">{ui.upload.themeCountLabel}</label>
                      <input
                        type="number"
                        min={5}
                        max={200}
                        value={themeCount}
                        onChange={(e) => onChangeThemeCount(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-2 text-sm text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400">{ui.upload.themeLevelLabel}</label>
                      <select
                        value={themeLevel}
                        onChange={(e) => onChangeThemeLevel(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-2 text-sm text-neutral-100"
                      >
                        <option value="A1">{ui.upload.themeLevelA1}</option>
                        <option value="A2">{ui.upload.themeLevelA2}</option>
                        <option value="B1">{ui.upload.themeLevelB1}</option>
                        <option value="B2">{ui.upload.themeLevelB2}</option>
                        <option value="C1">{ui.upload.themeLevelC1}</option>
                        <option value="C2">{ui.upload.themeLevelC2}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {tab === "upload" && (
                <div className="space-y-5">
                  <div>
                    <label className="text-sm text-neutral-300">{ui.upload.fileLabel}</label>
                    <input
                      type="file"
                      accept=".txt,.csv,.tsv,text/plain"
                      onChange={(e) => onFileUpload(e.target.files?.[0] ?? null)}
                      className="mt-2 block w-full text-sm text-neutral-200"
                    />
                    {fileName && (
                      <div className="mt-2 text-xs text-neutral-400">{fileName}</div>
                    )}
                    <div className="mt-2 text-xs text-neutral-400">{ui.upload.fileHint}</div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-300">{ui.upload.imageLabel}</label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-200 cursor-pointer">
                        📷 {ui.upload.imageCameraLabel}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => onImageUpload(e.target.files?.[0] ?? null)}
                          className="hidden"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-200 cursor-pointer">
                        🖼️ {ui.upload.imageGalleryLabel}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => onImageUpload(e.target.files?.[0] ?? null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {imagePreviewUrl && (
                      <div className="mt-3">
                        <img
                          src={imagePreviewUrl}
                          alt="preview"
                          className="max-h-48 rounded-lg border border-neutral-800"
                        />
                      </div>
                    )}
                    <div className="mt-2 text-xs text-neutral-400">{ui.upload.imageHint}</div>
                  </div>
                </div>
              )}

              {error && <div className="text-sm text-red-400">{error}</div>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
              >
                {ui.upload.actionCancel}
              </button>
              {tab === "json" ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isProcessing}
                  className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
                >
                  {isProcessing ? ui.upload.processing : ui.upload.actionSave}
                </button>
              ) : (
                <>
                  {tab === "table" && (
                    <button
                      type="button"
                      onClick={onReviewFromTable}
                      disabled={isProcessing}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-200 hover:text-white disabled:opacity-50"
                    >
                      {ui.upload.actionReview}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onGeneratePreview}
                    disabled={isProcessing}
                    className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
                  >
                    {isProcessing ? ui.upload.processing : ui.upload.actionGenerate}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

function ListPickerOverlay({
  lists,
  selectedListId,
  newListName,
  onChangeNewListName,
  onSelectList,
  onCreateList,
  onClose,
}: {
  lists: WorldList[]
  selectedListId: string
  newListName: string
  onChangeNewListName: (value: string) => void
  onSelectList: (id: string) => void
  onCreateList: () => void
  onClose: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-neutral-800 p-4 sm:p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
              {ui.upload.listLabel}
            </h2>
            <p className="text-sm text-neutral-300 mt-2">
              {ui.worldsOverlay.unlisted}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => onSelectList("")}
            className={[
              "w-full text-left rounded-lg border px-3 py-2 text-sm",
              selectedListId === ""
                ? "border-neutral-300 text-white"
                : "border-neutral-800 text-neutral-300 hover:text-white",
            ].join(" ")}
          >
            {ui.worldsOverlay.unlisted}
          </button>
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectList(list.id)}
              className={[
                "w-full text-left rounded-lg border px-3 py-2 text-sm",
                selectedListId === list.id
                  ? "border-neutral-300 text-white"
                  : "border-neutral-800 text-neutral-300 hover:text-white",
              ].join(" ")}
            >
              {list.name}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => onChangeNewListName(e.target.value)}
            placeholder={ui.worldsOverlay.newListPlaceholder}
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
          <button
            type="button"
            onClick={onCreateList}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            {ui.worldsOverlay.newListButton}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function WorldsOverlay({
  worlds,
  lists,
  newListName,
  onChangeNewListName,
  onCreateList,
  onAssignWorldToList,
  onMoveWorldInList,
  onRenameWorld,
  onRenameList,
  getWorldTitle,
  onMoveList,
  onHideWorld,
  collapsedListIds,
  onSetCollapsedListIds,
  activeWorldId,
  onClose,
  onSelectWorld,
}: {
  worlds: Array<{ id: string; title: string; description?: string }>
  lists: WorldList[]
  collapsedListIds: Record<string, boolean>
  onSetCollapsedListIds: (
    value:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void
  newListName: string
  onChangeNewListName: (value: string) => void
  onCreateList: () => void
  onAssignWorldToList: (worldId: string, listId: string | null) => void
  onMoveWorldInList: (listId: string, worldId: string, direction: "up" | "down") => void
  onRenameWorld: (worldId: string, title: string) => void
  onRenameList: (listId: string, title: string) => void
  getWorldTitle: (worldId: string, fallback: string) => string
  onMoveList: (listId: string, direction: "up" | "down") => void
  onHideWorld: (worldId: string) => void
  activeWorldId: string
  onClose: () => void
  onSelectWorld: (id: string) => void
}) {
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)
  const [editingWorldTitle, setEditingWorldTitle] = useState("")
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListTitle, setEditingListTitle] = useState("")

  const worldById = useMemo(() => new Map(worlds.map((w) => [w.id, w])), [worlds])
  const listIdByWorld = useMemo(() => {
    const map = new Map<string, string>()
    lists.forEach((list) => {
      list.worldIds.forEach((id) => {
        if (!map.has(id)) map.set(id, list.id)
      })
    })
    return map
  }, [lists])

  const unlistedWorlds = useMemo(
    () => worlds.filter((w) => !listIdByWorld.has(w.id)),
    [worlds, listIdByWorld]
  )

  const startEditWorld = (id: string, title: string) => {
    setEditingWorldId(id)
    setEditingWorldTitle(title)
  }

  const startEditList = (id: string, title: string) => {
    setEditingListId(id)
    setEditingListTitle(title)
  }

  const toggleList = (id: string) => {
    onSetCollapsedListIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-neutral-800 p-4 sm:p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
              {ui.worldsOverlay.title}
            </h2>
            <p className="text-sm text-neutral-300 mt-2">
              {ui.worldsOverlay.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => onChangeNewListName(e.target.value)}
            placeholder={ui.worldsOverlay.newListPlaceholder}
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
          <button
            type="button"
            onClick={onCreateList}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            {ui.worldsOverlay.newListButton}
          </button>
        </div>

        <div className="mt-5 space-y-5 max-h-[55vh] overflow-auto pr-1">
          {lists.map((list) => {
            const listWorlds = list.worldIds
              .map((id) => worldById.get(id))
              .filter(Boolean) as Array<{ id: string; title: string; description?: string }>
            if (listWorlds.length === 0) return null

            return (
              <div key={list.id}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-400 mb-2">
                  {editingListId === list.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingListTitle}
                        onChange={(e) => setEditingListTitle(e.target.value)}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onRenameList(list.id, editingListTitle)
                          setEditingListId(null)
                        }}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleList(list.id)}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                      >
                        {collapsedListIds[list.id] ? "▸" : "▾"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleList(list.id)}
                        className="text-neutral-300 hover:text-white"
                      >
                        {list.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditList(list.id, list.name)}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMoveList(list.id, "up")}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      disabled={lists[0]?.id === list.id}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveList(list.id, "down")}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      disabled={lists[lists.length - 1]?.id === list.id}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                {!collapsedListIds[list.id] && (
                  <div className="space-y-3">
                    {listWorlds.map((w, idx) => {
                      const active = w.id === activeWorldId
                      const title = getWorldTitle(w.id, w.title)
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => onSelectWorld(w.id)}
                          className={[
                            "w-full text-left rounded-2xl border p-4 transition",
                            "bg-neutral-900/40 hover:bg-neutral-900/60",
                            active ? "border-neutral-300" : "border-neutral-800",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between">
                            {editingWorldId === w.id ? (
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  value={editingWorldTitle}
                                  onChange={(e) => setEditingWorldTitle(e.target.value)}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRenameWorld(w.id, editingWorldTitle)
                                    setEditingWorldId(null)
                                  }}
                                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                                >
                                  ✓
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="text-base font-semibold text-neutral-50">{title}</div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditWorld(w.id, title)
                                  }}
                                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                                >
                                  ✎
                                </button>
                              </div>
                            )}
                            {active && (
                              <span className="text-xs rounded-full border border-neutral-700 px-2 py-1 text-neutral-200">
                                {ui.worldsOverlay.active}
                              </span>
                            )}
                          </div>

                          {w.description && (
                            <div className="mt-1 text-sm text-neutral-300">{w.description}</div>
                          )}

                          <div
                            className="mt-3 flex items-center justify-between gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={listIdByWorld.get(w.id) ?? ""}
                              onChange={(e) => onAssignWorldToList(w.id, e.target.value || null)}
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
                            >
                              <option value="">{ui.worldsOverlay.unlisted}</option>
                              {lists.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                              onClick={() => onMoveWorldInList(list.id, w.id, "up")}
                              disabled={idx === 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                              onClick={() => onMoveWorldInList(list.id, w.id, "down")}
                              disabled={idx === listWorlds.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                              onClick={() => onHideWorld(w.id)}
                            >
                              {ui.worldsOverlay.hideWorld}
                            </button>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  </div>
                )}
              </div>
            )
          })}

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-400 mb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleList("unlisted")}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                >
                  {collapsedListIds["unlisted"] ? "▸" : "▾"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleList("unlisted")}
                  className="text-neutral-300 hover:text-white"
                >
                  {ui.worldsOverlay.unlisted}
                </button>
              </div>
            </div>
            {!collapsedListIds["unlisted"] && (
              <div className="space-y-3">
                {unlistedWorlds.map((w) => {
                  const active = w.id === activeWorldId
                  const title = getWorldTitle(w.id, w.title)
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onSelectWorld(w.id)}
                      className={[
                        "w-full text-left rounded-2xl border p-4 transition",
                        "bg-neutral-900/40 hover:bg-neutral-900/60",
                        active ? "border-neutral-300" : "border-neutral-800",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between">
                        {editingWorldId === w.id ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingWorldTitle}
                              onChange={(e) => setEditingWorldTitle(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onRenameWorld(w.id, editingWorldTitle)
                                setEditingWorldId(null)
                              }}
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-base font-semibold text-neutral-50">{title}</div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                startEditWorld(w.id, title)
                              }}
                              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                        {active && (
                          <span className="text-xs rounded-full border border-neutral-700 px-2 py-1 text-neutral-200">
                            {ui.worldsOverlay.active}
                          </span>
                        )}
                      </div>

                      {w.description && (
                        <div className="mt-1 text-sm text-neutral-300">{w.description}</div>
                      )}

                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value=""
                            onChange={(e) => onAssignWorldToList(w.id, e.target.value || null)}
                            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
                          >
                            <option value="">{ui.worldsOverlay.unlisted}</option>
                            {lists.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                            onClick={() => onHideWorld(w.id)}
                          >
                            {ui.worldsOverlay.hideWorld}
                          </button>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
          >
            {ui.worldsOverlay.close}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function LevelsOverlay({
  world,
  displayTitle,
  activeLevelIndex,
  onClose,
  onSelectLevel,
}: {
  world: World
  displayTitle: string
  activeLevelIndex: number
  onClose: () => void
  onSelectLevel: (levelIndex: number) => void
}) {
    const levelItemTemplate = world.ui?.header?.levelItemTemplate ?? "Nivel {i}"

    const levels = useMemo(() => {
    const k = world.chunking.itemsPerGame
    const n = Math.max(1, Math.ceil(world.pool.length / k))
    return Array.from({ length: n }, (_, i) => {
      const start = i * k
      const end = Math.min(world.pool.length, start + k)
      return { i, start, end }
    })
  }, [world])

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-neutral-800 p-4 sm:p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
                {displayTitle} {ui.levelsOverlay.titleSuffix}
            </h2>

            <p className="text-sm text-neutral-300 mt-2">
                {world.description ??
                  formatTemplate(ui.levelsOverlay.defaultDescription, {
                    itemsPerGame: world.chunking.itemsPerGame,
                  })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-3 max-h-[55vh] overflow-auto pr-1">
          {levels.map((lvl) => {
            const active = lvl.i === activeLevelIndex
            return (
              <button
                key={lvl.i}
                type="button"
                onClick={() => onSelectLevel(lvl.i)}
                className={[
                  "w-full text-left rounded-2xl border p-4 transition",
                  "bg-neutral-900/40 hover:bg-neutral-900/60",
                  active ? "border-neutral-300" : "border-neutral-800",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-neutral-50">
                        {formatTemplate(levelItemTemplate, {
                            i: lvl.i + 1,
                            verb:
                            world.mode === "vocab"
                                ? extractVerbLabelFromPair(world.pool[lvl.start] as any)
                                : "",
                        })}
                        </div>                
                    <div className="text-xs text-neutral-300">
                    {lvl.start + 1}–{lvl.end} / {world.pool.length}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
          >
            {ui.levelsOverlay.close}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
