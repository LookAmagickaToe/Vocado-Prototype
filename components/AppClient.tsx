"use client"

import { useMemo, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

import { formatTemplate } from "@/lib/ui"
import { calculateNextReview } from "@/lib/srs"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import PhraseMemoryGame from "@/components/games/PhraseMemoryGame"
import type { World } from "@/types/worlds"
import { getUiSettings } from "@/lib/ui-settings"
import pointsConfig from "@/data/ui/points.json"
import { supabase } from "@/lib/supabase/client"
import NavFooter from "@/components/ui/NavFooter"
import TutorialOverlay, { TutorialStep } from "@/components/tutorial/TutorialOverlay"
import { callAi } from "@/lib/ai"

const BASE_WORLDS: World[] = []

const UPLOADED_WORLDS_STORAGE_KEY = "vocado-uploaded-worlds"
const WORLD_LISTS_STORAGE_KEY = "vocado-world-lists"
const WORLD_TITLE_OVERRIDES_STORAGE_KEY = "vocado-world-title-overrides"
const LAST_NEWS_FETCH_STORAGE_KEY = "vocado-last-news-fetch-date"
const WORLD_LIST_COLLAPSED_STORAGE_KEY = "vocado-world-list-collapsed"
const HIDDEN_WORLDS_STORAGE_KEY = "vocado-hidden-worlds"
const LAST_PLAYED_STORAGE_KEY = "vocado-last-played"
const LAST_LOGIN_STORAGE_KEY = "vocado-last-login"
const SEEDS_STORAGE_KEY = "vocado-seeds"
const BEST_SCORE_STORAGE_KEY = "vocado-best-scores"
const DAILY_STATE_STORAGE_KEY = "vocado-daily-state"
const WEEKLY_WORDS_STORAGE_KEY = "vocado-words-weekly"
const WEEKLY_START_STORAGE_KEY = "vocado-week-start"
const WEEKLY_SEEDS_STORAGE_KEY = "vocado-seeds-weekly"
const WEEKLY_SEEDS_START_STORAGE_KEY = "vocado-seeds-week-start"
const NEWS_STORAGE_KEY = "vocado-news-current"
const ONBOARDING_STORAGE_KEY = "vocado-onboarded"

const LANGUAGE_OPTIONS = ["Español", "Deutsch", "English", "Français"]

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string) => UUID_REGEX.test(value)

const generateUuid = () => {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const toHex = (b: number) => b.toString(16).padStart(2, "0")
      const hex = Array.from(bytes, toHex).join("")
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20
      )}-${hex.slice(20)}`
    }
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`
}

const getWeekStartIso = () => {
  const date = new Date()
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

const getLastPlayedKey = (source?: string, target?: string) => {
  const src = source?.trim() || "auto"
  const tgt = target?.trim() || "auto"
  return `${LAST_PLAYED_STORAGE_KEY}:${src}:${tgt}`
}

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
  originalId?: string
  lemma?: string
  emoji?: string
  explanation?: string
  example?: string
  syllables?: string
  include: boolean
  conjugate: boolean
}

type UploadTab = "table" | "upload" | "theme" | "news" | "json"
type UploadModeSelection = "auto" | "vocab" | "conjugation"

const buildUi = (uiSettings: ReturnType<typeof getUiSettings>) => ({
  onboarding: {
    title: uiSettings?.onboarding?.title ?? "Bienvenido a Vocado",
    subtitle:
      uiSettings?.onboarding?.subtitle ??
      "Configura tu idioma y noticias favoritas para empezar.",
    sourceLabel: uiSettings?.onboarding?.sourceLabel ?? "Idioma de origen",
    targetLabel: uiSettings?.onboarding?.targetLabel ?? "Idioma objetivo",
    newsLabel: uiSettings?.onboarding?.newsLabel ?? "Noticias",
    step2Title: uiSettings?.onboarding?.step2Title ?? "Vamos a crear tu primer mundo",
    step2Description:
      uiSettings?.onboarding?.step2Description ??
      "Escribe un tema y genera tu primera lista personalizada.",
    continue: uiSettings?.onboarding?.continue ?? "Continuar",
    start: uiSettings?.onboarding?.start ?? "Crear primer mundo",
  },
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
    editLabel: uiSettings?.worldsOverlay?.editLabel ?? "Editar",
    editTitle: uiSettings?.worldsOverlay?.editTitle ?? "Editar vocabulario",
    assignLabel: uiSettings?.worldsOverlay?.assignLabel ?? "Asignar a mundo",
    assignAction: uiSettings?.worldsOverlay?.assignAction ?? "Añadir",
    deleteLabel: uiSettings?.worldsOverlay?.deleteLabel ?? "Eliminar",
    deleteListLabel: uiSettings?.worldsOverlay?.deleteListLabel ?? "Eliminar lista",
    moveLabel: uiSettings?.worldsOverlay?.moveLabel ?? "Mover",
    moveToLabel: uiSettings?.worldsOverlay?.moveToLabel ?? "Mover a",
    deleteWorldConfirm:
      uiSettings?.worldsOverlay?.deleteWorldConfirm ??
      "¿Seguro que quieres eliminar este mundo?",
    deleteListConfirm:
      uiSettings?.worldsOverlay?.deleteListConfirm ??
      "¿Eliminar la lista? Se eliminarán {count} mundos.",
    confirmYes: uiSettings?.worldsOverlay?.confirmYes ?? "Sí",
    confirmCancel: uiSettings?.worldsOverlay?.confirmCancel ?? "Cancelar",
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
    tabNews: uiSettings?.upload?.tabNews ?? "Noticias",
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
    newsLabel: uiSettings?.upload?.newsLabel ?? "Enlace de la noticia",
    newsPlaceholder: uiSettings?.upload?.newsPlaceholder ?? "Pega el enlace del artículo",
    newsHint:
      uiSettings?.upload?.newsHint ??
      "Generaremos un resumen en el idioma objetivo y vocabulario según tu nivel.",
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
    reviewSyllables: uiSettings?.upload?.reviewSyllables ?? "Sílabas",
    posVerb: uiSettings?.upload?.posVerb ?? "verbo",
    posNoun: uiSettings?.upload?.posNoun ?? "sustantivo",
    posAdj: uiSettings?.upload?.posAdj ?? "adjetivo",
    posOther: uiSettings?.upload?.posOther ?? "otro",
    reviewAddRow: uiSettings?.upload?.reviewAddRow ?? "Agregar palabra",
    reviewMoreLabel: uiSettings?.upload?.reviewMoreLabel ?? "Agregar más palabras",
    reviewMorePlaceholder: uiSettings?.upload?.reviewMorePlaceholder ?? "Cantidad",
    reviewMoreButton: uiSettings?.upload?.reviewMoreButton ?? "Generar",
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
  home: {
    title: uiSettings?.home?.title ?? "Inicio",
  },
  news: {
    readButton: uiSettings?.news?.readButton ?? "Leer periódico",
    categoryOptions: {
      world: uiSettings?.news?.categoryOptions?.world ?? "World",
      wirtschaft: uiSettings?.news?.categoryOptions?.wirtschaft ?? "Economy",
      sport: uiSettings?.news?.categoryOptions?.sport ?? "Sport",
    },
    errors: {
      newsNoLink: uiSettings?.errors?.newsNoLink ?? "No link found.",
      newsNoWords: uiSettings?.errors?.newsNoWords ?? "No words found.",
      saveFailed: uiSettings?.errors?.saveFailed ?? "Save failed.",
    },
  },
  tutorial: {
    welcomeTitle: uiSettings?.tutorial?.welcomeTitle ?? "Welcome",
    welcomeSubtitle: uiSettings?.tutorial?.welcomeSubtitle ?? "",
    sourceLabel: uiSettings?.tutorial?.sourceLabel ?? "Source",
    targetLabel: uiSettings?.tutorial?.targetLabel ?? "Target",
    levelLabel: uiSettings?.tutorial?.levelLabel ?? "Level",
    newsLabel: uiSettings?.tutorial?.newsLabel ?? "News",
    startJourney: uiSettings?.tutorial?.startJourney ?? "Start",
    saving: uiSettings?.tutorial?.saving ?? "Saving...",
    tourTitle: uiSettings?.tutorial?.tourTitle ?? "Welcome!",
    tourSubtitle: uiSettings?.tutorial?.tourSubtitle ?? "",
    tourWorldsTitle: uiSettings?.tutorial?.tourWorldsTitle ?? "Worlds",
    tourWorldsDesc: uiSettings?.tutorial?.tourWorldsDesc ?? "",
    tourSmartTitle: uiSettings?.tutorial?.tourSmartTitle ?? "Smart Content",
    tourSmartDesc: uiSettings?.tutorial?.tourSmartDesc ?? "",
    letsPlay: uiSettings?.tutorial?.letsPlay ?? "Let's Play",
    playIntroTitle: uiSettings?.tutorial?.playIntroTitle ?? "Your First Game",
    playIntroDesc: uiSettings?.tutorial?.playIntroDesc ?? "",
    playingTitle: uiSettings?.tutorial?.playingTitle ?? "Good Luck!",
    playingDesc: uiSettings?.tutorial?.playingDesc ?? "",
    postGameTitle: uiSettings?.tutorial?.postGameTitle ?? "Great Job!",
    postGameSubtitle: uiSettings?.tutorial?.postGameSubtitle ?? "",
    postGameDesc: uiSettings?.tutorial?.postGameDesc ?? "",
    createTitle: uiSettings?.tutorial?.createTitle ?? "Create anything",
    createExamples: uiSettings?.tutorial?.createExamples ?? "",
    tryCreating: uiSettings?.tutorial?.tryCreating ?? "Try Creating",
    createInstructionTitle: uiSettings?.tutorial?.createInstructionTitle ?? "Create",
    createInstructionDesc: uiSettings?.tutorial?.createInstructionDesc ?? "",
    finalTitle: uiSettings?.tutorial?.finalTitle ?? "All Systems Go!",
    finalSubtitle: uiSettings?.tutorial?.finalSubtitle ?? "",
    pointsAwarded: uiSettings?.tutorial?.pointsAwarded ?? "Points Awarded",
    dailyChallenge: uiSettings?.tutorial?.dailyChallenge ?? "Daily Challenge",
    newsReader: uiSettings?.tutorial?.newsReader ?? "News Reader",
    finalDesc: uiSettings?.tutorial?.finalDesc ?? "",
    finish: uiSettings?.tutorial?.finish ?? "Finish",
  },
  generation: {
    meaningOf: uiSettings?.generation?.meaningOf ?? "Meaning of {source}.",
    exampleOf: uiSettings?.generation?.exampleOf ?? "Example: {source}.",
    uploadedList: uiSettings?.generation?.uploadedList ?? "Uploaded list",
    customList: uiSettings?.generation?.customList ?? "Custom list",
  },
})

type UiCopy = ReturnType<typeof buildUi>

function normalizeUploadedWorld(payload: any, ui: any, name?: string): World | null {
  const defaultTitle = ui?.generation?.uploadedList ?? "Uploaded list"
  const defaultCustomTitle = ui?.generation?.customList ?? "Custom list"

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
      title: name && name.trim().length > 0 ? name.trim() : defaultTitle,
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
      normalized.title = defaultCustomTitle
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


const extractVerbLabelFromPair = (pair: any) => {
  const prefix = pair.id.split("_")[0]
  return prefix || ""
}

const buildReviewItemsFromAi = (items: any[]) =>
  items.map((item) => {
    const pos =
      item?.pos === "verb" || item?.pos === "noun" || item?.pos === "adj" ? item.pos : "other"
    const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "")
    const normalizeEmoji = (value: unknown) => {
      if (typeof value !== "string") return "📰"
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : "📰"
    }

    return {
      source: normalizeText(item?.source),
      target: normalizeText(item?.target),
      pos,
      lemma: normalizeText(item?.lemma) || undefined,
      emoji: normalizeEmoji(item?.emoji),
      explanation: normalizeText(item?.explanation) || undefined,
      example: normalizeText(item?.example) || undefined,
      syllables: normalizeText(item?.syllables) || undefined,
      include: true,
      conjugate: false
    } as ReviewItem
  })

const buildWorldFromItems = (
  items: ReviewItem[],
  sourceLabel: string,
  targetLabel: string,
  ui: any
): World => {
  const id = `news-${Date.now()}`
  const pool = items.map((item, index) => {
    const explanation =
      item.explanation?.trim() || formatTemplate(ui.generation.meaningOf, { source: item.source })
    const example =
      item.example?.trim() || formatTemplate(ui.generation.exampleOf, { source: item.source })
    const syllables = item.syllables?.trim()
    const explanationWithSyllables =
      item.pos === "verb" && syllables && item.target
        ? `${explanation}\n${item.target}\n${syllables}`
        : explanation
    return {
      id: `${id}-${index}`,
      es: item.source,
      de: item.target,
      image: { type: "emoji", value: item.emoji?.trim() || "📰" },
      pos: item.pos,
      explanation: explanationWithSyllables,
      example,
    }
  })
  return {
    id,
    title: "Noticias",
    description: "Noticias del día.",
    mode: "vocab",
    pool,
    chunking: { itemsPerGame: 8 },
    source_language: sourceLabel,
    target_language: targetLabel,
    ui: {
      vocab: {
        carousel: {
          primaryLabel: `${sourceLabel}:`,
          secondaryLabel: `${targetLabel}:`,
        },
      },
      winning: {
        nextDefault: ui.news.readButton
      }
    },
  }
}

type AppClientProps = {
  initialUploadedWorlds?: World[]
  initialLists?: WorldList[]
  initialHiddenWorldIds?: string[]
  initialWorldTitleOverrides?: Record<string, string>
  initialSupabaseLoaded?: boolean
  initialProfile?: {
    level?: string
    sourceLanguage?: string
    targetLanguage?: string
    newsCategory?: string
    seeds?: number
    weeklySeeds?: number
    weeklySeedsWeekStart?: string
    weeklyWords?: number
    weeklyWordsWeekStart?: string
    dailyState?: { date: string; games: number; upload: boolean; news: boolean } | null
    dailyStateDate?: string
    onboardingDone?: boolean
  }
}

export default function AppClient({
  initialUploadedWorlds = [],
  initialLists = [],
  initialHiddenWorldIds = [],
  initialWorldTitleOverrides = {},
  initialSupabaseLoaded = false,
  initialProfile,
}: AppClientProps) {
  const searchParams = useSearchParams()
  const [isAuthed, setIsAuthed] = useState(true)
  const [isSupabaseLoaded, setIsSupabaseLoaded] = useState(initialSupabaseLoaded)
  const [uploadedWorlds, setUploadedWorlds] = useState<World[]>(initialUploadedWorlds)
  const allWorlds = useMemo(() => [...uploadedWorlds], [uploadedWorlds])
  const [worldLists, setWorldLists] = useState<WorldList[]>(initialLists)
  const [worldTitleOverrides, setWorldTitleOverrides] = useState<Record<string, string>>(
    initialWorldTitleOverrides
  )
  const [collapsedListIds, setCollapsedListIds] = useState<Record<string, boolean>>({})
  const [hiddenWorldIds, setHiddenWorldIds] = useState<string[]>(initialHiddenWorldIds)

  const [worldId, setWorldId] = useState<string>("world-0")
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
  const [uploadTab, setUploadTab] = useState<UploadTab>("theme")
  const [uploadStep, setUploadStep] = useState<"input" | "review">("input")
  const [uploadModeSelection, setUploadModeSelection] = useState<UploadModeSelection>("auto")
  const [profileSettings, setProfileSettings] = useState({
    level: initialProfile?.level ?? "",
    sourceLanguage: initialProfile?.sourceLanguage ?? "",
    targetLanguage: initialProfile?.targetLanguage ?? "",
    newsCategory: initialProfile?.newsCategory ?? "",
  })
  const uiSettings = useMemo(
    () => getUiSettings(profileSettings.sourceLanguage),
    [profileSettings.sourceLanguage]
  )
  const ui = useMemo(() => buildUi(uiSettings), [uiSettings])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem("vocado-profile-settings")
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        (parsed.level ||
          parsed.sourceLanguage ||
          parsed.targetLanguage ||
          parsed.newsCategory)
      ) {
        setProfileSettings((prev) => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore
    }
  }, [])
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
  const [autoNewsLoading, setAutoNewsLoading] = useState(false)
  const [themeText, setThemeText] = useState("")
  const [themeCount, setThemeCount] = useState(20)
  const [promptText, setPromptText] = useState("")
  const [promptError, setPromptError] = useState<string | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const [newsUrl, setNewsUrl] = useState("")
  const [newsSummary, setNewsSummary] = useState<string[]>([])
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomeStep, setWelcomeStep] = useState<"profile" | "world">("profile")
  const [welcomeSource, setWelcomeSource] = useState(profileSettings.sourceLanguage || "")
  const [welcomeTarget, setWelcomeTarget] = useState(profileSettings.targetLanguage || "")
  const [welcomeNews, setWelcomeNews] = useState(profileSettings.newsCategory || "world")
  const [welcomeSaving, setWelcomeSaving] = useState(false)
  const [welcomeError, setWelcomeError] = useState<string | null>(null)
  const [onboardingKey, setOnboardingKey] = useState<string | null>(null)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewMode, setReviewMode] = useState<"vocab" | "conjugation">("vocab")
  const [reviewExtraCount, setReviewExtraCount] = useState(8)
  const [reviewExtraError, setReviewExtraError] = useState<string | null>(null)
  const [reviewExtraLoading, setReviewExtraLoading] = useState(false)
  const [isEditWorldOpen, setIsEditWorldOpen] = useState(false)
  const [editWorldId, setEditWorldId] = useState<string | null>(null)
  const [editWorldTitle, setEditWorldTitle] = useState("")
  const [editReviewItems, setEditReviewItems] = useState<ReviewItem[]>([])
  const [editExtraCount, setEditExtraCount] = useState(8)
  const [editExtraError, setEditExtraError] = useState<string | null>(null)
  const [editExtraLoading, setEditExtraLoading] = useState(false)
  const [editAssignTargetId, setEditAssignTargetId] = useState("")
  const [editSaveError, setEditSaveError] = useState<string | null>(null)
  const [uploadTargetWorldId, setUploadTargetWorldId] = useState<string>("new")
  const [isListPickerOpen, setIsListPickerOpen] = useState(false)
  const [listPickerName, setListPickerName] = useState("")
  const [seeds, setSeeds] = useState(0)
  const [bestScores, setBestScores] = useState<Record<string, number>>({})

  // used to force-remount the game (restart) without touching game internals
  const [gameSeed, setGameSeed] = useState(0)
  const [winAssignedIds, setWinAssignedIds] = useState<Set<string>>(new Set())

  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>("done")

  useEffect(() => {
    setWinAssignedIds(new Set())
  }, [worldId, levelIndex, gameSeed])

  useEffect(() => {
    // Initialize tutorial step from dailyState (persisted in DB) or profile
    // If onboarding is NOT done, we start at 'welcome'
    if (initialProfile?.onboardingDone === false || (initialProfile as any)?.onboarding_done === false) {
      setTutorialStep("welcome")
      return
    }

    // Check dailyState for intermediate steps
    if (initialProfile?.dailyState) {
      const storedStep = (initialProfile.dailyState as any).tutorialStep
      if (typeof storedStep === "string") {
        setTutorialStep(storedStep as TutorialStep)
      } else if (onboardingKey) {
        // Fallback: check if local storage says we are done
        const isDone = window.localStorage.getItem(onboardingKey) === "1"
        if (!isDone) setTutorialStep("welcome")
      }
    } else {
      // No daily state, check local storage or default to done if profile says so? 
      // Actually profile.onboardingDone is the source of truth for "welcome" vs "done".
      // If onboardingDone is true, likely done.
    }
    const rawBest = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY)
    if (rawBest) {
      try {
        setBestScores(JSON.parse(rawBest))
      } catch { } // ignore
    }
  }, [initialProfile, onboardingKey])

  // Save tutorial progress
  const saveTutorialProgress = async (nextStep: TutorialStep) => {
    setTutorialStep(nextStep)

    // transform step to something persistent
    // We Piggyback on dailyState
    const today = new Date().toISOString().slice(0, 10)
    let currentDaily: any = { date: today, games: 0, upload: false, news: false }

    // merge with existing if valid
    const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
    if (rawDaily) {
      try {
        const parsed = JSON.parse(rawDaily)
        if (parsed.date === today) currentDaily = { ...parsed }
      } catch { }
    }

    currentDaily.tutorialStep = nextStep

    // Save to local
    window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(currentDaily))

    // Save to server
    // We reuse syncStatsToServer which takes dailyState
    const weeklySeedsValue = Number(window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY) || "0") || 0
    // wordsLearned is not in scope here either? 
    // It is defined in HomeClient. In AppClient, we don't track wordsLearned in state.
    // We can read from storage or pass 0 (syncStatsToServer handles existing values maybe?)
    // Actually AppClient calls syncStatsToServer at line 492.
    // We should check syncStatsToServer signature.
    const weeklyWordsValue = Number(window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY) || "0") || 0
    await syncStatsToServer(seeds, weeklySeedsValue, weeklyWordsValue, getWeekStartIso(), currentDaily)
  }

  const handleTutorialNext = async () => {
    if (tutorialStep === "welcome") {
      saveTutorialProgress("tour_intro")
    } else if (tutorialStep === "tour_intro") {
      saveTutorialProgress("play_intro")
    } else if (tutorialStep === "play_intro") {
      // This step advances when user clicks the world?
      // Or when they start the game?
      // "The user may play the first world".
      // We'll advance to 'playing' (internal) or just keep 'play_intro' until they win?
      // Let's assume onWin advances.
    } else if (tutorialStep === "post_game") {
      saveTutorialProgress("create_instruction")
    } else if (tutorialStep === "create_instruction") {
      // User needs to click Open Upload
    } else if (tutorialStep === "final") {
      // Award points and finish
      const bonus = 50
      const nextSeeds = seeds + bonus
      setSeeds(nextSeeds)
      window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
      saveTutorialProgress("done")
      // Also mark onboarding done in profile just in case
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (token) {
        fetch("/api/auth/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ onboardingDone: true })
        }).catch(() => { })
      }
    }
  }

  const terminateTutorial = () => {
    saveTutorialProgress("done")
    const session = supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (token) {
        fetch("/api/auth/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ onboardingDone: true })
        }).catch(() => { })
      }
    })
  }

  const onTutorialSaveProfile = async (data: { source: string; target: string; level: string; news: string }) => {
    // reuse saveWelcomeProfile logic essentially
    setWelcomeSaving(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) throw new Error("No session")

      await fetch("/api/auth/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sourceLanguage: data.source,
          targetLanguage: data.target,
          level: data.level,
          newsCategory: data.news,
          // Do NOT set onboardingDone true yet
        }),
      })

      // update local state
      setProfileSettings(prev => ({
        ...prev,
        sourceLanguage: data.source,
        targetLanguage: data.target,
        level: data.level,
        newsCategory: data.news || "",
      }))

      // Advance
      saveTutorialProgress("tour_intro")
    } catch (err) {
      console.error(err)
    } finally {
      setWelcomeSaving(false)
    }
  }

  const sourceLabel = profileSettings.sourceLanguage || ui.upload.tableSource
  const targetLabel = profileSettings.targetLanguage || ui.upload.tableTarget

  const handleProfileUpdate = (next: {
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
  }) => {
    setProfileSettings(next)
  }

  const syncStatsToServer = async (
    nextSeeds: number,
    nextWeeklySeeds: number,
    nextWeeklyWords: number,
    weekStart: string,
    dailyState?: { date: string; games: number; upload: boolean; news: boolean }
  ) => {
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      const res = await fetch("/api/auth/profile/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          seeds: nextSeeds,
          weeklySeeds: nextWeeklySeeds,
          weeklySeedsWeekStart: weekStart,
          weeklyWords: nextWeeklyWords,
          weekStart,
          dailyState,
          dailyStateDate: dailyState?.date ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.warn("[stats] sync failed", data?.details || data?.error || res.status)
      }
    } catch {
      // ignore sync errors
    }
  }

  const saveWelcomeProfile = async () => {
    setWelcomeSaving(true)
    setWelcomeError(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) throw new Error("No session")
      const nextProfile = {
        level: profileSettings.level || "A2",
        sourceLanguage: welcomeSource,
        targetLanguage: welcomeTarget,
        newsCategory: welcomeNews,
      }
      const res = await fetch("/api/auth/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextProfile),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Save failed")
      }
      handleProfileUpdate(nextProfile)
      if (typeof window !== "undefined") {
        window.localStorage.setItem("vocado-profile-settings", JSON.stringify(nextProfile))
        const key = onboardingKey || ONBOARDING_STORAGE_KEY
        window.localStorage.setItem(key, "1")
      }
      setWelcomeStep("world")
    } catch (err) {
      setWelcomeError((err as Error).message)
    } finally {
      setWelcomeSaving(false)
    }
  }

  const awardExperience = (
    moves: number,
    worldIdValue: string,
    levelIdx: number,
    wordsLearnedCount: number,
    pairsCount: number
  ) => {
    if (typeof window === "undefined") return
    const baseScore = Number(pointsConfig?.baseScore ?? 100)
    const minMovesFactor = Number(pointsConfig?.minMovesFactor ?? 1.5)
    const firstMultiplier = Number(pointsConfig?.firstMultiplier ?? 1.2)
    const perfectMultiplier = Number(pointsConfig?.perfectMultiplier ?? 1)
    const exponent = Number(pointsConfig?.exponent ?? 2)
    const pairs = Math.max(1, pairsCount || 1)
    const n = Math.max(1, moves)
    const minMoves = Math.max(1, Math.floor(pairs * minMovesFactor))
    const baseValue = baseScore * Math.pow(pairs / n, exponent)
    const perfectBonus = n <= minMoves ? Math.ceil(pairs * perfectMultiplier) : 0

    const rawBestStore = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY)
    let bestMap: Record<string, number> = {}
    if (rawBestStore) {
      try {
        bestMap = JSON.parse(rawBestStore)
      } catch {
        bestMap = {}
      }
    }
    const key = `${worldIdValue}:${levelIdx}`
    const sBest = typeof bestMap[key] === "number" ? bestMap[key] : 0
    const isNew = sBest === 0
    const scoreBaseRounded = Math.round(baseValue)
    // The previous line `const perfectBonus = n <= minMoves ? Math.ceil(pairs * perfectMultiplier) : 0` was duplicated.
    // Removed the duplicate and kept the first one.

    // Calculate total score for THIS run
    const runScore = scoreBaseRounded + perfectBonus
    const scoreWithMultiplier = Math.round(runScore * (isNew ? firstMultiplier : 1))

    // Practice bonus for replays
    const practiceBonus = isNew ? 0 : Math.ceil(baseScore * 0.1)

    // Payout is the total score for this run + practice bonus (cumulative)
    // We update the best score for the UI, but we don't deduct it from payout anymore.
    const payout = scoreWithMultiplier + practiceBonus

    const newBest = Math.max(runScore, sBest)
    bestMap[key] = newBest
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, JSON.stringify(bestMap))
    setBestScores(bestMap)

    const storedSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const serverSeeds = initialProfile?.seeds || 0
    const currentSeeds = Math.max(storedSeeds, serverSeeds)
    const nextSeeds = currentSeeds + payout
    window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))

    const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
    const today = new Date().toISOString().slice(0, 10)

    let localDaily: { date: string; games: number; upload: boolean; news: boolean } | null = null
    if (rawDaily) {
      try {
        const parsed = JSON.parse(rawDaily)
        if (parsed?.date === today) {
          localDaily = parsed
        }
      } catch {
        // ignore
      }
    }

    const serverDaily = initialProfile?.dailyState?.date === today ? initialProfile.dailyState : null

    let dailyState = { date: today, games: 0, upload: false, news: false }
    if (localDaily || serverDaily) {
      dailyState = {
        date: today,
        games: Math.max(localDaily?.games ?? 0, serverDaily?.games ?? 0),
        upload: !!(localDaily?.upload || serverDaily?.upload),
        news: !!(localDaily?.news || serverDaily?.news),
      }
    }
    dailyState.games = Math.min(3, dailyState.games + 1)
    if (dailyState.games === 3) {
      const dailyRewardKey = `${today}-games`
      const rewarded = window.localStorage.getItem(dailyRewardKey) === "1"
      if (!rewarded) {
        const bonusSeeds =
          Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
        window.localStorage.setItem(SEEDS_STORAGE_KEY, String(bonusSeeds + 45))
        window.localStorage.setItem(dailyRewardKey, "1")
      }
    }
    window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(dailyState))

    const weekStart = getWeekStartIso()
    const storedWeekStart = window.localStorage.getItem(WEEKLY_START_STORAGE_KEY)
    if (storedWeekStart !== weekStart) {
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
    }
    const rawWeekly = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
    let weeklyValue = Number(rawWeekly || "0") || 0
    if (isNew) {
      weeklyValue = weeklyValue + Math.max(0, wordsLearnedCount || 0)
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(weeklyValue))
    }

    const storedSeedsWeekStart = window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
    if (storedSeedsWeekStart !== weekStart) {
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
    }
    const rawWeeklySeeds = window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY)
    let weeklySeeds = Number(rawWeeklySeeds || "0") || 0

    const finalSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const seedsDelta = Math.max(0, finalSeeds - currentSeeds)
    if (seedsDelta > 0) {
      weeklySeeds += seedsDelta
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(weeklySeeds))
    }

    setSeeds(finalSeeds)
    syncStatsToServer(finalSeeds, weeklySeeds, weeklyValue, weekStart, dailyState)

    return {
      payout,
      totalBefore: currentSeeds,
      totalAfter: finalSeeds,
    }
  }

  const fetchDailyNews = async (today: string, token: string, overrides: Record<string, string>) => {
    // 1. Fetch headlines
    setAutoNewsLoading(true)
    try {
      const category = profileSettings.newsCategory || "world"
      const resp = await fetch(`/api/news/tagesschau?ressort=${category}`)
      if (!resp.ok) throw new Error("Failed to fetch headlines")
      const data = await resp.json()
      const items: any[] = Array.isArray(data?.items) ? data.items : []
      const topHeadline = items[0]

      if (topHeadline && topHeadline.url) {
        // 2. Generate world
        const result = await callAi({
          task: "news",
          url: topHeadline.url,
          level: profileSettings.level || undefined,
          sourceLabel: profileSettings.sourceLanguage || "Español",
          targetLabel: profileSettings.targetLanguage || "Alemán",
        })

        const nextSummary = Array.isArray(result?.summary) ? result.summary : []
        const reviewItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])

        if (reviewItems.length > 0) {
          const baseDate = topHeadline.date || new Date().toISOString()

          const localeForLanguage = (value: string) => {
            const lower = value.toLowerCase()
            if (lower.includes("deutsch") || lower.includes("german")) return "de-DE"
            if (lower.includes("english")) return "en-US"
            if (lower.includes("français") || lower.includes("french")) return "fr-FR"
            if (lower.includes("italiano") || lower.includes("italian")) return "it-IT"
            if (lower.includes("portugu")) return "pt-PT"
            return "es-ES"
          }

          const dateLabel = new Intl.DateTimeFormat(localeForLanguage(profileSettings.targetLanguage || "Alemán"), {
            day: "2-digit",
            month: "long",
          }).format(new Date(baseDate))

          const dateSuffix = dateLabel ? ` - ${dateLabel}` : ""
          const worldTitle = `Vocado Diario - ${topHeadline.title || "Noticia"}${dateSuffix}`

          const newsWorld = {
            ...buildWorldFromItems(reviewItems, profileSettings.sourceLanguage || "Español", profileSettings.targetLanguage || "Alemán", ui),
            title: worldTitle,
            description: "Noticias del día.",
            news: {
              summary: nextSummary,
              sourceUrl: topHeadline.url,
              title: ui.news.title
            }
          }

          // 3. Save world
          // Find or create "Vocado Diario" list
          let listId = ""
          // list fetching is async inside persistWorlds? No, persistWorlds expects explicit listId if we want to assign.
          // We need to fetch lists first. But we just loaded lists in loadSupabaseState.
          // Actually loadSupabaseState only SETS state, it doesn't return them to here easily unless we wait.
          // But we can fetch lists again or just use a dedicated "ensureList" call.

          // Quick fetch lists
          const listResp = await fetch("/api/storage/worlds/list", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          })
          if (listResp.ok) {
            const listData = await listResp.json()
            const existingList = (listData.lists || []).find((l: any) => l.name === "Vocado Diario")
            if (existingList) {
              listId = existingList.id
            } else {
              // Create list
              const newListId = generateUuid()
              await fetch("/api/storage/state", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  lists: [{ id: newListId, name: "Vocado Diario", position: 0 }],
                }),
              })
              listId = newListId
            }
          }

          if (listId) {
            setUploadListId(listId) // Hacky side effect?
            /* 
               persistWorlds is designed to save to state. 
               It calls /api/storage/worlds/save which takes a listId.
               But persistWorlds uses `uploadListId` from state closure.
               We can't rely on setState being immediate.
               We should call api directly or modify persistWorlds to take listId.
               Let's call api directly for safety.
            */

            await fetch("/api/storage/worlds/save", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                worlds: [newsWorld],
                listId: listId,
                positions: { [newsWorld.id]: 0 },
              }),
            })

            // Add to local state
            setUploadedWorlds(prev => [newsWorld, ...prev])
            // Also assign to list in local state?
            // Rely on refresh or simplified push
            setWorldLists(prev => {
              const match = prev.find(l => l.id === listId)
              if (match) {
                return prev.map(l => l.id === listId ? { ...l, worldIds: [newsWorld.id, ...l.worldIds] } : l)
              }
              return [{ id: listId, name: "Vocado Diario", worldIds: [newsWorld.id] }, ...prev]
            })

            // Mark done
            window.localStorage.setItem(LAST_NEWS_FETCH_STORAGE_KEY, today)
          }
        }
      }
    } catch (err) {
      console.error("Auto-news failed", err)
    } finally {
      setAutoNewsLoading(false)
    }
  }

  useEffect(() => {
    setWelcomeSource(profileSettings.sourceLanguage || "")
    setWelcomeTarget(profileSettings.targetLanguage || "")
    setWelcomeNews(profileSettings.newsCategory || "world")
  }, [profileSettings.sourceLanguage, profileSettings.targetLanguage, profileSettings.newsCategory])

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      const userId = data.user?.id ?? ""
      const key = userId ? `${ONBOARDING_STORAGE_KEY}:${userId}` : ONBOARDING_STORAGE_KEY
      setOnboardingKey(key)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isSupabaseLoaded) return
    if (uploadedWorlds.length > 0) return
    const key = onboardingKey || ONBOARDING_STORAGE_KEY
    const alreadyOnboarded = window.localStorage.getItem(key)
    if (alreadyOnboarded) return
    setShowWelcome(true)
    setWelcomeStep("profile")
  }, [uploadedWorlds.length, onboardingKey, isSupabaseLoaded])

  useEffect(() => {
    if (typeof window === "undefined") return
    const syncSeeds = () => {
      const rawSeeds = window.localStorage.getItem(SEEDS_STORAGE_KEY)
      setSeeds(rawSeeds ? Number(rawSeeds) || 0 : 0)
    }
    const weekStart = getWeekStartIso()
    if (typeof initialProfile?.seeds === "number") {
      const local = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
      const server = initialProfile.seeds
      const final = Math.max(local, server)
      window.localStorage.setItem(SEEDS_STORAGE_KEY, String(final))
      setSeeds(final)
    } else {
      syncSeeds()
    }
    if (typeof initialProfile?.weeklyWords === "number") {
      const serverWeekStart = initialProfile.weeklyWordsWeekStart || ""
      if (serverWeekStart === weekStart) {
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(initialProfile.weeklyWords))
      } else {
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
      }
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
    }
    if (typeof initialProfile?.weeklySeeds === "number") {
      const serverWeekStart = initialProfile.weeklySeedsWeekStart || ""
      if (serverWeekStart === weekStart) {
        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(initialProfile.weeklySeeds))
      } else {
        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
      }
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SEEDS_STORAGE_KEY) {
        syncSeeds()
      }
    }
    window.addEventListener("storage", handleStorage)
    window.addEventListener("focus", syncSeeds)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("focus", syncSeeds)
    }
  }, [
    initialProfile?.seeds,
    initialProfile?.weeklyWords,
    initialProfile?.weeklyWordsWeekStart,
    initialProfile?.weeklySeeds,
    initialProfile?.weeklySeedsWeekStart,
  ])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(UPLOADED_WORLDS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sanitized = parsed.map((item) => normalizeUploadedWorld(item, ui)).filter(Boolean) as World[]
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
    window.localStorage.setItem(LAST_LOGIN_STORAGE_KEY, String(Date.now()))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const current = allWorlds.find((w) => w.id === worldId)
    if (!current) return
    const payload = {
      id: current.id,
      title: getWorldTitle(current.id, current.title),
      levelIndex,
      updatedAt: Date.now(),
    }
    const key = getLastPlayedKey(
      profileSettings.sourceLanguage,
      profileSettings.targetLanguage
    )
    window.localStorage.setItem(key, JSON.stringify(payload))
  }, [
    worldId,
    levelIndex,
    allWorlds,
    getWorldTitle,
    profileSettings.sourceLanguage,
    profileSettings.targetLanguage,
  ])

  useEffect(() => {
    if (!searchParams) return
    const open = searchParams.get("open")
    if (open === "upload") {
      setIsUploadOpen(true)
      setIsWorldsOpen(false)
      setIsMenuOpen(false)
    }
    if (open === "worlds") {
      setIsWorldsOpen(true)
      setIsUploadOpen(false)
      setIsMenuOpen(false)
    }
    const worldParam = searchParams.get("world")
    const levelParam = searchParams.get("level")
    if (worldParam) {
      const exists = allWorlds.find((w) => w.id === worldParam)
      if (exists) {
        setWorldId(worldParam)
        if (levelParam) {
          const l = parseInt(levelParam, 10)
          if (!isNaN(l) && l >= 0) {
            setLevelIndex(l)
          } else {
            setLevelIndex(0)
          }
        } else {
          setLevelIndex(0)
        }
      }
    }
  }, [searchParams, allWorlds])

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
    if (typeof window === "undefined") return
    const flag = window.localStorage.getItem("vocado-refresh-worlds")
    if (flag === "1") {
      window.localStorage.removeItem("vocado-refresh-worlds")
      loadSupabaseState()
    }
  }, [])

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

  const languageFilteredWorlds = useMemo(() => {
    if (!profileSettings.sourceLanguage && !profileSettings.targetLanguage) {
      return allWorlds
    }
    return allWorlds.filter((world) => {
      const source = (world as any).source_language || ""
      const target = (world as any).target_language || ""
      if (profileSettings.sourceLanguage && source !== profileSettings.sourceLanguage) {
        return false
      }
      if (profileSettings.targetLanguage && target && target !== profileSettings.targetLanguage) {
        return false
      }
      if (profileSettings.targetLanguage && !target) {
        return false
      }
      return true
    })
  }, [allWorlds, profileSettings.sourceLanguage, profileSettings.targetLanguage])

  const visibleWorlds = useMemo(
    () => languageFilteredWorlds.filter((w) => !hiddenWorldIds.includes(w.id)),
    [languageFilteredWorlds, hiddenWorldIds]
  )

  const uploadedWorldIdSet = useMemo(
    () => new Set(uploadedWorlds.map((w) => w.id)),
    [uploadedWorlds]
  )

  const appendableWorlds = useMemo(
    () =>
      languageFilteredWorlds
        .filter((world) => world.mode === "vocab" && world.submode !== "conjugation")
        .map((world) => ({
          id: world.id,
          title: getWorldTitle(world.id, world.title),
          isUploaded: uploadedWorldIdSet.has(world.id),
        })),
    [languageFilteredWorlds, getWorldTitle, uploadedWorldIdSet]
  )

  const currentWorld = useMemo(() => {
    const exact = allWorlds.find((w) => w.id === worldId)
    if (exact) return exact
    return visibleWorlds[0] ?? null
  }, [allWorlds, visibleWorlds, worldId])

  const isNewsWorld =
    !!currentWorld &&
    currentWorld.mode === "vocab" &&
    Array.isArray(currentWorld.news?.summary) &&
    currentWorld.news.summary.length > 0

  const levelsCount = useMemo(() => {
    if (!currentWorld) return 0
    const k = currentWorld.chunking.itemsPerGame
    return Math.max(1, Math.ceil(currentWorld.pool.length / k))
  }, [currentWorld])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!currentWorld) return
    const key = getLastPlayedKey(
      profileSettings.sourceLanguage,
      profileSettings.targetLanguage
    )
    const payload = {
      id: currentWorld.id,
      title: getWorldTitle(currentWorld.id, currentWorld.title),
      levelIndex: Math.max(0, Math.min(levelIndex, levelsCount - 1)),
    }
    window.localStorage.setItem(key, JSON.stringify(payload))
  }, [
    currentWorld,
    levelIndex,
    levelsCount,
    profileSettings.sourceLanguage,
    profileSettings.targetLanguage,
    worldTitleOverrides,
  ])

  const worldTitle = currentWorld ? worldTitleOverrides[currentWorld.id] ?? currentWorld.title : ""
  const safeLevel = currentWorld ? Math.min(levelIndex, levelsCount - 1) + 1 : 0




  const openWorlds = () => {
    setIsWorldsOpen(true)
    setIsMenuOpen(false)
  }

  const startFirstWorld = () => {
    setShowWelcome(false)
    setIsWorldsOpen(true)
    setIsMenuOpen(false)
  }

  const openNewsSummary = (world: World) => {
    if (typeof window === "undefined") return
    if (!world.news?.summary?.length) return
    window.localStorage.setItem(
      NEWS_STORAGE_KEY,
      JSON.stringify({
        summary: world.news.summary,
        sourceUrl: world.news.sourceUrl,
        title: world.news.title ?? world.title,
        items:
          world.mode === "vocab"
            ? world.pool.map((item) => ({
              source: item.es,
              target: item.de,
              pos: item.pos ?? "other",
              emoji: item.image?.type === "emoji" ? item.image.value : "📰",
              explanation: item.explanation,
              example: item.example,
            }))
            : [],
      })
    )
    window.location.href = "/news?summary=1"
  }

  const createList = () => {
    const name = newListName.trim()
    if (!name) return
    setWorldLists((prev) => [...prev, { id: generateUuid(), name, worldIds: [] }])
    setNewListName("")
  }

  const addList = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return ""
    const id = generateUuid()
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

  const deleteWorld = async (worldIdToDelete: string) => {
    setUploadedWorlds((prev) => prev.filter((world) => world.id !== worldIdToDelete))
    setWorldTitleOverrides((prev) => {
      if (!prev[worldIdToDelete]) return prev
      const next = { ...prev }
      delete next[worldIdToDelete]
      return next
    })
    setHiddenWorldIds((prev) => prev.filter((id) => id !== worldIdToDelete))
    setWorldLists((prev) =>
      prev.map((list) => ({
        ...list,
        worldIds: list.worldIds.filter((id) => id !== worldIdToDelete),
      }))
    )

    if (worldIdToDelete === worldId) {
      const nextWorld = visibleWorlds.find((w) => w.id !== worldIdToDelete)
      if (nextWorld) {
        setWorldId(nextWorld.id)
      }
    }

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      await fetch("/api/storage/worlds/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ worldIds: [worldIdToDelete] }),
      })
    } catch (error) {
      console.error("Failed to delete world from Supabase", error)
    }
  }

  const deleteList = async (listId: string) => {
    const list = worldLists.find((item) => item.id === listId)
    const worldIds = list?.worldIds ?? []

    if (worldIds.length > 0) {
      setUploadedWorlds((prev) => prev.filter((world) => !worldIds.includes(world.id)))
      setWorldTitleOverrides((prev) => {
        const next = { ...prev }
        worldIds.forEach((id) => {
          delete next[id]
        })
        return next
      })
      setHiddenWorldIds((prev) => prev.filter((id) => !worldIds.includes(id)))
    }

    setWorldLists((prev) => prev.filter((item) => item.id !== listId))

    if (worldIds.includes(worldId)) {
      const nextWorld = visibleWorlds.find((w) => !worldIds.includes(w.id))
      if (nextWorld) {
        setWorldId(nextWorld.id)
      }
    }

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      await fetch("/api/storage/lists/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listId }),
      })
    } catch (error) {
      console.error("Failed to delete list from Supabase", error)
    }
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
    setUploadTab("theme")
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
    setNewsUrl("")
    setNewsSummary([])
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

  const persistWorldUpdate = async (world: World) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return
    const listEntry = worldLists.find((list) => list.worldIds.includes(world.id))
    const listId = listEntry?.id ?? null
    const position = listEntry
      ? listEntry.worldIds.indexOf(world.id)
      : uploadedWorlds.findIndex((item) => item.id === world.id)
    await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: [world],
        listId,
        positions: { [world.id]: Math.max(0, position) },
      }),
    })
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
    } else {
      setWorldLists([])
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
      } else {
        setWorldTitleOverrides({})
      }

      const hidden = worlds.filter((world) => world.hidden).map((world) => world.worldId)
      if (hidden.length > 0) {
        setHiddenWorldIds((prev) => Array.from(new Set([...prev, ...hidden])))
      } else {
        setHiddenWorldIds([])
      }
    } else {
      setUploadedWorlds([])
      setWorldTitleOverrides({})
      setHiddenWorldIds([])
    }

    setIsSupabaseLoaded(true)
  }

  const syncSupabaseState = async () => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return

    const invalidLists = worldLists.filter((list) => !isUuid(list.id))
    if (invalidLists.length > 0) {
      const idMap = new Map<string, string>()
      invalidLists.forEach((list) => {
        idMap.set(list.id, generateUuid())
      })
      setWorldLists((prev) =>
        prev.map((list) => ({
          ...list,
          id: idMap.get(list.id) ?? list.id,
        }))
      )
      setCollapsedListIds((prev) => {
        const next: Record<string, boolean> = {}
        Object.entries(prev).forEach(([key, value]) => {
          const mapped = idMap.get(key) ?? key
          next[mapped] = value
        })
        return next
      })
      setUploadListId((prev) => idMap.get(prev) ?? prev)
      return
    }

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

  // Auto-News Effect
  useEffect(() => {
    if (!isSupabaseLoaded) return
    if (autoNewsLoading) return
    const checkNews = async () => {
      // Use LOCAL time date to ensure "Today" matches user's wall clock
      const d = new Date()
      // Format YYYY-MM-DD in local time
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

      const vocabList = worldLists.find(l => l.name === "Vocado Diario")
      let hasNewsToday = false

      if (vocabList && vocabList.worldIds.length > 0) {
        const latestId = vocabList.worldIds[0] // Assuming first is latest
        if (latestId.startsWith("news-")) {
          const timestamp = Number(latestId.replace("news-", ""))
          if (!isNaN(timestamp)) {
            // Convert content timestamp to LOCAL YYYY-MM-DD
            const cd = new Date(timestamp)
            const contentDate = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}-${String(cd.getDate()).padStart(2, "0")}`
            if (contentDate === today) {
              hasNewsToday = true
            }
          }
        }
      }

      if (hasNewsToday) return

      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (token) {
        fetchDailyNews(today, token, worldTitleOverrides)
      }
    }
    checkNews()
  }, [isSupabaseLoaded, profileSettings.newsCategory, profileSettings.sourceLanguage, worldLists, uploadedWorlds])

  const persistWorlds = async (worldsToPersist: World[], activeWorldId?: string) => {
    // Tutorial Hook: If creating, advance to final
    if (tutorialStep === "create_instruction" || tutorialStep === "creating") {
      saveTutorialProgress("final")
    }

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
    if (value === "json" || value === "news") {
      setUploadTargetWorldId("new")
    }
  }

  const createWorldFromPrompt = async () => {
    const theme = promptText.trim()
    if (!theme) {
      setPromptError("Agrega un tema para crear tu mundo.")
      return
    }
    setPromptLoading(true)
    setPromptError(null)
    try {
      const result = await callAi({
        task: "theme_list",
        theme,
        count: 20,
        level: profileSettings.level || "A2",
        mode: null,
        sourceLabel,
        targetLabel,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length === 0) {
        setPromptError(ui.upload.errorNoItems)
        return
      }
      const generatedTitle =
        typeof result?.title === "string" && result.title.trim()
          ? result.title.trim()
          : theme
      const review = buildReviewItemsFromAi(items)
      const world = buildVocabWorldWithTitle(review, generatedTitle)
      await persistWorlds([world], world.id)
      setWorldId(world.id)
      setIsWorldsOpen(false)
      setPromptText("")
    } catch (error) {
      setPromptError((error as Error).message)
    } finally {
      setPromptLoading(false)
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
      const explanation = normalizeText(item?.explanation)
      const example = normalizeText(item?.example)
      const syllables = normalizeText(item?.syllables)
      return {
        id: `review-${Date.now()}-${index}`,
        source: normalizeText(item?.source),
        target: normalizeText(item?.target),
        pos,
        originalId: typeof item?.id === "string" ? item.id : undefined,
        lemma: normalizeText(item?.lemma) || undefined,
        emoji: normalizeEmoji(item?.emoji),
        explanation: explanation || undefined,
        example: example || undefined,
        syllables: syllables || undefined,
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

  const buildReviewItemsFromWorld = (world: World) => {
    if (!world || world.mode !== "vocab") return []
    return (world.pool ?? []).map((item: any, index: number) => {
      const pos = normalizePos(item?.pos)
      return {
        id: `edit-${world.id}-${index}`,
        originalId: typeof item?.id === "string" ? item.id : undefined,
        source: normalizeText(item?.es ?? item?.left),
        target: normalizeText(item?.de ?? item?.right),
        pos,
        lemma: normalizeText(item?.lemma) || undefined,
        emoji: item?.image?.type === "emoji" ? item.image.value : "📝",
        explanation: normalizeText(item?.explanation) || undefined,
        example: normalizeText(item?.example) || undefined,
        syllables: normalizeText(item?.syllables) || undefined,
        include: true,
        conjugate: pos === "verb",
      } as ReviewItem
    })
  }

  const openWorldEditor = (worldIdValue: string) => {
    const world = allWorlds.find((w) => w.id === worldIdValue)
    if (!world || world.mode !== "vocab") return
    setEditWorldId(world.id)
    setEditWorldTitle(getWorldTitle(world.id, world.title))
    setEditReviewItems(buildReviewItemsFromWorld(world))
    setEditExtraCount(8)
    setEditExtraError(null)
    setEditSaveError(null)
    setEditAssignTargetId("")
    setIsEditWorldOpen(true)
  }

  const closeWorldEditor = () => {
    setIsEditWorldOpen(false)
    setEditWorldId(null)
    setEditReviewItems([])
    setEditExtraError(null)
    setEditSaveError(null)
    setEditAssignTargetId("")
  }

  const generateMoreEditItems = async () => {
    if (editExtraLoading) return
    setEditExtraError(null)
    const count = Math.max(1, Math.floor(editExtraCount || 0))
    if (!count) {
      setEditExtraError(ui.upload.errorNoInput)
      return
    }
    const baseTheme =
      editWorldTitle.trim() ||
      uploadName.trim() ||
      editReviewItems
        .map((item) => item.source || item.target)
        .filter(Boolean)
        .slice(0, 8)
        .join(", ")
    if (!baseTheme) {
      setEditExtraError(ui.upload.errorNoInput)
      return
    }
    setEditExtraLoading(true)
    try {
      const desiredMode = uploadModeSelection === "auto" ? null : uploadModeSelection
      const result = await callAi({
        task: "theme_list",
        theme: baseTheme,
        count,
        level: profileSettings.level || "A2",
        mode: desiredMode,
        sourceLabel,
        targetLabel,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (!items.length) {
        setEditExtraError(ui.upload.errorNoItems)
        return
      }
      const newItems = buildReviewItemsFromAi(items)
      setEditReviewItems((prev) => {
        const seen = new Set(
          prev.map(
            (item) => `${item.source.trim().toLowerCase()}|${item.target.trim().toLowerCase()}`
          )
        )
        const additions = newItems.filter((item) => {
          const source = item.source.trim()
          const target = item.target.trim()
          if (!source && !target) return false
          const key = `${source.toLowerCase()}|${target.toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        return [...prev, ...additions]
      })
    } catch (error) {
      setEditExtraError((error as Error).message)
    } finally {
      setEditExtraLoading(false)
    }
  }

  const saveEditedWorld = async () => {
    if (!editWorldId) return
    setEditSaveError(null)
    const world = allWorlds.find((w) => w.id === editWorldId)
    if (!world || world.mode !== "vocab") {
      setEditSaveError(ui.upload.errorNoItems)
      return
    }
    const included = editReviewItems.filter(
      (item) => item.include && item.source.trim() && item.target.trim()
    )
    if (!included.length) {
      setEditSaveError(ui.upload.errorNoItems)
      return
    }
    try {
      let conjugationMap: Record<string, any> | undefined = undefined
      const verbsForConjugation = included
        .filter((item) => item.pos === "verb" && item.conjugate)
        .map((item) => ({
          lemma: item.lemma?.trim() || item.target,
          translation: item.source,
        }))
        .filter((item) => item.lemma)
      if (verbsForConjugation.length > 0) {
        const result = await callAi({
          task: "conjugate",
          verbs: verbsForConjugation,
          sourceLabel,
          targetLabel,
        })
        const conjugations = Array.isArray(result?.conjugations) ? result.conjugations : []
        conjugationMap = conjugations.reduce<Record<string, any>>((acc, entry) => {
          if (entry?.verb) {
            acc[entry.verb] = {
              infinitive: entry.verb,
              translation: entry.translation ?? "",
              sections: Array.isArray(entry.sections) ? entry.sections : [],
            }
          }
          return acc
        }, {})
      }

      const updatedPool = included.map((item, index) => {
        const verbKey = (item.lemma?.trim() || item.target)?.trim()
        const conjugation =
          item.pos === "verb" && verbKey && conjugationMap
            ? conjugationMap[verbKey]
            : (world.pool ?? []).find((p: any) => p?.id === item.originalId)?.conjugation
        const explanation = item.explanation?.trim() || `Significado de ${item.source}.`
        const example = item.example?.trim() || `Ejemplo: ${item.source}.`
        const syllables = item.syllables?.trim()
        const explanationWithSyllables =
          item.pos === "verb" && syllables && item.target
            ? `${explanation}\n${item.target}\n${syllables}`
            : explanation
        return {
          id: item.originalId ?? `${world.id}-${index}-${item.source}`,
          es: item.source,
          de: item.target,
          image: { type: "emoji", value: item.emoji?.trim() || "📝" },
          pos: item.pos,
          explanation: explanationWithSyllables,
          example,
          conjugation,
        }
      })
      const updatedWorld = { ...world, pool: updatedPool } as World
      await persistWorlds([updatedWorld], updatedWorld.id)
      setEditReviewItems(buildReviewItemsFromWorld(updatedWorld))
    } catch (error) {
      setEditSaveError((error as Error).message)
    }
  }

  const assignEditItemsToWorld = async () => {
    if (!editAssignTargetId) return
    const targetWorld = allWorlds.find((w) => w.id === editAssignTargetId)
    if (!targetWorld || targetWorld.mode !== "vocab") {
      setEditSaveError(ui.upload.errorNoItems)
      return
    }
    const selected = editReviewItems.filter(
      (item) => item.include && item.source.trim() && item.target.trim()
    )
    if (!selected.length) {
      setEditSaveError(ui.upload.errorNoItems)
      return
    }
    try {
      const additions = selected.map((item, index) => ({
        id: `${targetWorld.id}-${Date.now()}-${index}`,
        es: item.source,
        de: item.target,
        image: { type: "emoji", value: item.emoji?.trim() || "📝" },
        pos: item.pos,
        explanation: item.explanation,
        example: item.example,
        conjugation: undefined,
      }))
      const updatedTarget = {
        ...targetWorld,
        pool: [...(targetWorld.pool ?? []), ...additions],
      } as World
      await persistWorlds([updatedTarget], updatedTarget.id)
    } catch (error) {
      setEditSaveError((error as Error).message)
    }
  }

  const generateMoreReviewItems = async () => {
    if (reviewExtraLoading) return
    setReviewExtraError(null)
    const count = Math.max(1, Math.floor(reviewExtraCount || 0))
    if (!count) {
      setReviewExtraError(ui.upload.errorNoInput)
      return
    }
    const baseTheme =
      themeText.trim() ||
      uploadName.trim() ||
      reviewItems
        .map((item) => item.source || item.target)
        .filter(Boolean)
        .slice(0, 8)
        .join(", ")
    if (!baseTheme) {
      setReviewExtraError(ui.upload.errorNoInput)
      return
    }
    setReviewExtraLoading(true)
    try {
      const desiredMode = uploadModeSelection === "auto" ? null : uploadModeSelection
      const result = await callAi({
        task: "theme_list",
        theme: baseTheme,
        count,
        level: profileSettings.level || "A2",
        mode: desiredMode,
        sourceLabel,
        targetLabel,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (!items.length) {
        setReviewExtraError(ui.upload.errorNoItems)
        return
      }
      const newItems = buildReviewItemsFromAi(items)
      setReviewItems((prev) => {
        const seen = new Set(
          prev.map(
            (item) => `${item.source.trim().toLowerCase()}|${item.target.trim().toLowerCase()}`
          )
        )
        const additions = newItems.filter((item) => {
          const source = item.source.trim()
          const target = item.target.trim()
          if (!source && !target) return false
          const key = `${source.toLowerCase()}|${target.toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        return [...prev, ...additions]
      })
    } catch (error) {
      setReviewExtraError((error as Error).message)
    } finally {
      setReviewExtraLoading(false)
    }
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
        sourceLabel,
        targetLabel,
        level: profileSettings.level || undefined,
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
        sourceLabel: targetLabel,
        targetLabel: sourceLabel,
        level: profileSettings.level || undefined,
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
        sourceLabel,
        targetLabel,
        level: profileSettings.level || undefined,
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
      if (uploadTab !== "news") {
        setNewsSummary([])
      }
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
          level: profileSettings.level || "A2",
          mode: desiredMode,
          sourceLabel,
          targetLabel,
        })
        const items = Array.isArray(result?.items) ? result.items : []
        if (items.length === 0) {
          setUploadError(ui.upload.errorNoItems)
          return
        }
        if (!uploadName.trim() && typeof result?.title === "string") {
          setUploadName(result.title)
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

      if (uploadTab === "news") {
        if (!newsUrl.trim()) {
          setUploadError(ui.upload.errorNoInput)
          return
        }
        const result = await callAi({
          task: "news",
          url: newsUrl.trim(),
          level: profileSettings.level || undefined,
          sourceLabel,
          targetLabel,
        })
        const items = Array.isArray(result?.items) ? result.items : []
        const summary = Array.isArray(result?.summary) ? result.summary : []
        if (items.length === 0) {
          setUploadError(ui.upload.errorNoItems)
          return
        }
        setNewsSummary(summary)
        startReview(buildReviewItemsFromAi(items), "vocab")
        return
      }

      if (uploadTab === "upload") {
        if (imageUpload) {
          const result = await callAi({
            task: "parse_image",
            image: { data: imageUpload.data, mimeType: imageUpload.mimeType },
            mode: desiredMode,
            sourceLabel,
            targetLabel,
            level: profileSettings.level || undefined,
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
          sourceLabel,
          targetLabel,
          level: profileSettings.level || undefined,
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

  const buildVocabPoolFromItems = (
    items: ReviewItem[],
    idPrefix: string,
    conjugationMap?: Record<string, any>
  ) =>
    items.map((item, index) => {
      const verbKey = (item.lemma?.trim() || item.target)?.trim()
      const conjugation =
        item.pos === "verb" && verbKey && conjugationMap
          ? conjugationMap[verbKey]
          : undefined
      const explanation =
        item.explanation?.trim() ||
        `Significado de ${item.source}.`
      const example =
        item.example?.trim() ||
        `Ejemplo: ${item.source}.`
      const syllables = item.syllables?.trim()
      const explanationWithSyllables =
        item.pos === "verb" && syllables && item.target
          ? `${explanation}\n${item.target}\n${syllables}`
          : explanation
      return {
        id: `${idPrefix}-${index}-${item.source}`,
        es: item.source,
        de: item.target,
        image: { type: "emoji", value: item.emoji?.trim() || "📝" },
        pos: item.pos,
        explanation: explanationWithSyllables,
        example,
        conjugation,
      }
    })

  const buildVocabWorld = (items: ReviewItem[], conjugationMap?: Record<string, any>): World => {
    const id = `upload-${Date.now()}`
    const title = uploadName.trim() || "Uploaded list"
    return {
      id,
      title,
      description: `Lista personalizada: ${title}`,
      mode: "vocab",
      pool: buildVocabPoolFromItems(items, id, conjugationMap),
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

  const buildVocabWorldWithTitle = (
    items: ReviewItem[],
    title: string,
    conjugationMap?: Record<string, any>
  ): World => {
    const id = `upload-${Date.now()}`
    const cleanTitle = title.trim() || "Uploaded list"
    return {
      id,
      title: cleanTitle,
      description: `Lista personalizada: ${cleanTitle}`,
      mode: "vocab",
      pool: buildVocabPoolFromItems(items, id, conjugationMap),
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
      const isNewsFlow = uploadTab === "news" && newsSummary.length > 0

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

      let conjugationMap: Record<string, any> | undefined = undefined
      if (verbsForConjugation.length > 0) {
        const result = await callAi({
          task: "conjugate",
          verbs: verbsForConjugation,
          sourceLabel,
          targetLabel,
        })
        const conjugations = Array.isArray(result?.conjugations) ? result.conjugations : []
        conjugationMap = conjugations.reduce<Record<string, any>>((acc, entry) => {
          if (entry?.verb) {
            acc[entry.verb] = {
              infinitive: entry.verb,
              translation: entry.translation ?? "",
              sections: Array.isArray(entry.sections) ? entry.sections : [],
            }
          }
          return acc
        }, {})
        const conjugationWorld = buildConjugationWorld(conjugations)
        worldsToSave.push(conjugationWorld)
        if (reviewMode === "conjugation") {
          activeId = conjugationWorld.id
        }
      }

      if (reviewMode === "vocab") {
        const appendTargetId = uploadTargetWorldId !== "new" ? uploadTargetWorldId : ""
        if (isNewsFlow && appendTargetId) {
          setUploadError("Las noticias crean un mundo nuevo.")
          return
        }
        if (appendTargetId) {
          const target = allWorlds.find(
            (world) => world.id === appendTargetId && world.mode === "vocab" && world.submode !== "conjugation"
          )
          if (!target) {
            setUploadError(ui.upload.errorNoItems)
            return
          }
          const pool = buildVocabPoolFromItems(
            included,
            `append-${Date.now()}`,
            conjugationMap
          )
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
              source_language: (target as any).source_language ?? sourceLabel,
              target_language: (target as any).target_language ?? targetLabel,
              pool: [...(target.pool ?? []), ...pool],
            } as World
            worldsToSave.push(extendedWorld)
            activeId = extendedWorld.id
          }
        } else {
          const baseWorld = buildVocabWorld(included, conjugationMap)
          const vocabWorld = {
            ...baseWorld,
            source_language: sourceLabel,
            target_language: targetLabel,
            ...(isNewsFlow
              ? {
                news: {
                  summary: newsSummary,
                  sourceUrl: newsUrl.trim() || undefined,
                },
                chunking: { mode: "sequential", itemsPerGame: 8 },
                ui: {
                  ...(baseWorld.ui ?? {}),
                  winning: {
                    ...(baseWorld.ui?.winning ?? {}),
                    nextDefault: ui.news.readButton,
                  },
                },
              }
              : {}),
          }
          worldsToSave.push(vocabWorld)
          activeId = vocabWorld.id
        }
      }

      if (worldsToSave.length === 0) {
        setUploadError(ui.upload.errorNoItems)
        return
      }

      await persistWorlds(worldsToSave, activeId)
      if (typeof window !== "undefined") {
        const today = new Date().toISOString().slice(0, 10)
        let dailyState = { date: today, games: 0, upload: false, news: false }
        const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
        if (rawDaily) {
          try {
            const parsed = JSON.parse(rawDaily)
            if (parsed?.date === today) {
              dailyState = {
                date: today,
                games: parsed?.games ?? 0,
                upload: !!parsed?.upload,
                news: !!parsed?.news,
              }
            }
          } catch {
            // ignore
          }
        }
        if (!dailyState.upload) {
          dailyState.upload = true
          const currentSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
          const nextSeeds = currentSeeds + 10
          window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
          setSeeds(nextSeeds)
          window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(dailyState))
          const weekStart = getWeekStartIso()
          const rawWeekly = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
          const weeklyValue = Number(rawWeekly || "0") || 0
          const storedSeedsWeekStart = window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
          if (storedSeedsWeekStart !== weekStart) {
            window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
            window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
          }
          const rawWeeklySeeds = window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY)
          let weeklySeeds = Number(rawWeeklySeeds || "0") || 0
          weeklySeeds += 10
          window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(weeklySeeds))
          syncStatsToServer(nextSeeds, weeklySeeds, weeklyValue, weekStart, dailyState)
        }
      }
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
    if (!currentWorld || levelsCount === 0) return
    setLevelIndex((i) => {
      const next = i + 1
      return next >= levelsCount ? 0 : next // wrap to level 0 (or clamp if you prefer)
    })
    setGameSeed((s) => s + 1) // force remount so the game resets cleanly
  }

  const headerInstructions =
    currentWorld?.ui?.page?.instructions ??
    currentWorld?.description ??
    (currentWorld?.mode === "vocab"
      ? "Empareja las palabras en español con las palabras en alemán."
      : "Construye la frase en el orden correcto.")

  const currentChunk = useMemo(() => {
    if (!currentWorld) return []
    const k = currentWorld.chunking.itemsPerGame
    const start = Math.min(levelIndex, Math.max(0, levelsCount - 1)) * k
    return currentWorld.pool.slice(start, start + k)
  }, [currentWorld, levelIndex, levelsCount])

  const chunkVerb = useMemo(() => {
    if (!currentWorld || currentWorld.mode !== "vocab") return ""
    const first = currentChunk[0]
    if (!first) return ""
    // types: VocabPair has id + es, safe here because mode === "vocab"
    return extractVerbLabelFromPair(first as any)
  }, [currentWorld?.mode, currentChunk])

  const levelLabelTemplate = currentWorld?.ui?.header?.levelLabelTemplate ?? "Nivel {i}/{n}"
  const currentVerb =
    currentWorld?.mode === "vocab"
      ? extractVerbLabelFromPair(
        currentWorld.pool[
        Math.min(levelIndex, Math.max(0, levelsCount - 1)) * currentWorld.chunking.itemsPerGame
        ] as any
      )
      : ""

  const levelLabel = formatTemplate(levelLabelTemplate, {
    i: safeLevel,
    n: levelsCount,
    verb: currentVerb,
  })

  // Removed legacy welcomeOverlay definition
  const welcomeOverlay = null

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6F2EB] text-[#3A3A3A] px-3 sm:px-6 pb-24">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-12 gap-4 items-start">
          {/* STICKY HEADER */}
          <div className="col-span-12 sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-sm h-[56px] flex items-center">
            <div className="flex items-center justify-between gap-2 md:hidden w-full">
              <div className="text-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = "/"
                    }
                  }}
                  className="text-xl font-semibold tracking-tight"
                >
                  Voc<span className="text-[rgb(var(--vocado-accent-rgb))]">ado</span>
                </button>
                <div className="text-xs text-[#3A3A3A]/60 mt-1 truncate">
                  {worldTitle} — {levelLabel}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="text-xs text-[#3A3A3A]/60">
                  <span className="font-semibold">{seeds}</span> 🌱
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-end justify-between gap-4 w-full">
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = "/"
                    }
                  }}
                  className="text-2xl font-semibold tracking-tight"
                >
                  Voc<span className="text-[rgb(var(--vocado-accent-rgb))]">ado</span>
                </button>
                <div className="mt-1 text-sm text-[#3A3A3A]/60">
                  {worldTitle} — {levelLabel}
                </div>
                <p className="text-sm text-[#3A3A3A]/60 mt-1">
                  {headerInstructions}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={restart} className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  {ui.menu.restart}
                </Button>
                <div className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-200">
                  <span className="font-semibold">{seeds}</span> 🌱
                </div>
              </div>
            </div>
          </div>

          {/* GAME AREA */}
          <div className="col-span-12 space-y-3 mt-3">
            <div className="flex items-center justify-between md:hidden">
              <div className="text-xs text-neutral-300">{headerInstructions}</div>
              <Button onClick={restart} className="flex items-center gap-2 text-xs px-2 py-1">
                <RotateCcw className="w-3 h-3" />
                {ui.menu.restart}
              </Button>
            </div>
            {!currentWorld && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-200">
                <div className="text-sm text-neutral-300">{ui.worldsOverlay.description}</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    onClick={() => setIsWorldsOpen(true)}
                    className="border border-neutral-800 bg-neutral-900/60 text-neutral-100"
                  >
                    {ui.menu.worlds}
                  </Button>
                  <Button
                    onClick={() => openUpload()}
                    className="border border-neutral-800 bg-neutral-900/60 text-neutral-100"
                  >
                    {ui.menu.upload}
                  </Button>
                </div>
              </div>
            )}
            {currentWorld?.mode === "vocab" ? (
              currentWorld ? (
                <VocabMemoryGame
                  key={`${worldId}:${levelIndex}:${gameSeed}`}
                  world={currentWorld}
                  levelIndex={Math.min(levelIndex, levelsCount - 1)}
                  onNextLevel={isNewsWorld ? () => openNewsSummary(currentWorld) : nextLevel}
                  primaryLabelOverride={sourceLabel ? `${sourceLabel}:` : undefined}
                  secondaryLabelOverride={targetLabel ? `${targetLabel}:` : undefined}
                  nextLabelOverride={isNewsWorld ? ui.news.readButton : undefined}
                  renderWinActions={({ matchedOrder, carouselIndex, setCarouselIndex, carouselItem }) => {
                    if (!currentWorld || currentWorld.submode === "conjugation") return null
                    if (!matchedOrder?.length || !carouselItem) return null
                    if (typeof carouselIndex !== "number" || !setCarouselIndex) return null
                    const isAssigned = winAssignedIds.has(carouselItem.id)
                    const handleAssign = (rating: "easy" | "medium" | "difficult") => {
                      const pairIndex = currentWorld.pool.findIndex((pair) => pair.id === carouselItem.id)
                      if (pairIndex < 0) return
                      const pair = currentWorld.pool[pairIndex]
                      const nextSrs = calculateNextReview(pair.srs, rating)
                      const updatedWorld: World = {
                        ...currentWorld,
                        pool: currentWorld.pool.map((item, index) =>
                          index === pairIndex ? { ...item, srs: nextSrs } : item
                        ),
                      }
                      setUploadedWorlds((prev) =>
                        prev.map((stored) => (stored.id === updatedWorld.id ? updatedWorld : stored))
                      )
                      const nextAssigned = new Set(winAssignedIds)
                      nextAssigned.add(carouselItem.id)
                      setWinAssignedIds(nextAssigned)
                      void persistWorldUpdate(updatedWorld).catch(() => {})
                      if (matchedOrder.length > 1) {
                        let nextIndex = carouselIndex
                        for (let i = 1; i <= matchedOrder.length; i += 1) {
                          const idx = (carouselIndex + i) % matchedOrder.length
                          if (!nextAssigned.has(matchedOrder[idx])) {
                            nextIndex = idx
                            break
                          }
                        }
                        setCarouselIndex(nextIndex)
                      }
                    }
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleAssign("difficult")}
                          disabled={isAssigned}
                          className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#F4E6E3] px-3 py-2 text-xs text-[#3A3A3A] disabled:opacity-50"
                        >
                          {ui.difficultyHard}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAssign("medium")}
                          disabled={isAssigned}
                          className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#F6F0E1] px-3 py-2 text-xs text-[#3A3A3A] disabled:opacity-50"
                        >
                          {ui.difficultyMedium}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAssign("easy")}
                          disabled={isAssigned}
                          className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#E9F2E7] px-3 py-2 text-xs text-[#3A3A3A] disabled:opacity-50"
                        >
                          {ui.difficultyEasy}
                        </button>
                      </div>
                    )
                  }}
                  onWin={(moves, wordsLearnedCount) => {
                    const res = awardExperience(
                      moves,
                      currentWorld.id,
                      Math.min(levelIndex, levelsCount - 1),
                      wordsLearnedCount,
                      currentChunk.length
                    )

                    if (tutorialStep === "play_intro" || tutorialStep === "tour_intro") {
                      saveTutorialProgress("post_game")
                    }

                    return res
                  }}
                />
              ) : null
            ) : currentWorld ? (
              <PhraseMemoryGame
                key={`${worldId}:${levelIndex}:${gameSeed}`}
                world={currentWorld}
                levelIndex={Math.min(levelIndex, levelsCount - 1)}
                onNextLevel={nextLevel}
                onWin={(moves, wordsLearnedCount) =>
                  awardExperience(
                    moves,
                    currentWorld.id,
                    Math.min(levelIndex, levelsCount - 1),
                    wordsLearnedCount,
                    currentChunk.length
                  )
                }
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* WORLDS OVERLAY */}
      <AnimatePresence>
        {isWorldsOpen && (
          <WorldsOverlay
            ui={ui}
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
            onEditWorld={openWorldEditor}
            onDeleteWorld={deleteWorld}
            onDeleteList={deleteList}
            activeWorldId={worldId}
            onClose={() => setIsWorldsOpen(false)}
            onSelectWorld={(id) => {
              setPendingWorldId(id)
              setIsWorldsOpen(false)
              setIsLevelsOpen(true)
            }}
            promptText={promptText}
            promptError={promptError}
            promptLoading={promptLoading}
            promptSuggestions={["family", "kitchen", "in the restaurant"]}
            promptPlaceholder="family"
            onPromptChange={setPromptText}
            onPromptSubmit={createWorldFromPrompt}
            bestScores={bestScores}
          />
        )}
      </AnimatePresence>

      {/* UPLOAD OVERLAY */}
      <AnimatePresence>
        {isUploadOpen && (
          <UploadOverlay
            ui={ui}
            name={uploadName}
            text={uploadText}
            error={uploadError}
            lists={worldLists}
            selectedListId={uploadListId}
            targetWorldId={uploadTargetWorldId}
            appendableWorlds={appendableWorlds}
            hiddenWorlds={languageFilteredWorlds
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
            newsUrl={newsUrl}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            onChangeName={setUploadName}
            onChangeText={setUploadText}
            onChangeTab={handleChangeUploadTab}
            onChangeModeSelection={setUploadModeSelection}
            onChangeTargetWorldId={setUploadTargetWorldId}
            onChangeThemeText={setThemeText}
            onChangeThemeCount={setThemeCount}
            onChangeNewsUrl={setNewsUrl}
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
            reviewExtraCount={reviewExtraCount}
            reviewExtraLoading={reviewExtraLoading}
            reviewExtraError={reviewExtraError}
            onChangeReviewExtraCount={setReviewExtraCount}
            onGenerateMoreReview={generateMoreReviewItems}
            onOpenListPicker={() => setIsListPickerOpen(true)}
            onRestoreWorld={restoreWorld}
            onClose={() => setIsUploadOpen(false)}
            onSubmit={submitUpload}
            onSubmitReview={submitReview}
          />
        )}
      </AnimatePresence>

      {/* EDIT WORLD OVERLAY */}
      <AnimatePresence>
        {isEditWorldOpen && editWorldId && (
          <WorldEditOverlay
            ui={ui}
            title={editWorldTitle}
            items={editReviewItems}
            appendableWorlds={appendableWorlds}
            assignTargetId={editAssignTargetId}
            editExtraCount={editExtraCount}
            editExtraLoading={editExtraLoading}
            editExtraError={editExtraError}
            editSaveError={editSaveError}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            onChangeAssignTargetId={setEditAssignTargetId}
            onUpdateItem={(id, value) =>
              setEditReviewItems((prev) =>
                prev.map((item) => (item.id === id ? { ...item, ...value } : item))
              )
            }
            onAddItem={() =>
              setEditReviewItems((prev) => [
                ...prev,
                {
                  id: `edit-${Date.now()}`,
                  source: "",
                  target: "",
                  pos: "other",
                  include: true,
                  conjugate: false,
                  emoji: "📝",
                },
              ])
            }
            onRemoveItem={(id) =>
              setEditReviewItems((prev) => prev.filter((item) => item.id !== id))
            }
            onChangeExtraCount={setEditExtraCount}
            onGenerateMore={generateMoreEditItems}
            onAssignToWorld={assignEditItemsToWorld}
            onSave={saveEditedWorld}
            onClose={closeWorldEditor}
          />
        )}
      </AnimatePresence>

      {/* LIST PICKER OVERLAY */}
      <AnimatePresence>
        {isListPickerOpen && (
          <ListPickerOverlay
            ui={ui}
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
            ui={ui}
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

              if (tutorialStep === "play_intro" || tutorialStep === "tour_intro") {
                saveTutorialProgress("playing_game")
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* BOTTOM NAVIGATION */}
      <NavFooter showOnGame={true} />
    </div >
  )
}

function WorldEditOverlay({
  ui,
  title,
  items,
  appendableWorlds,
  assignTargetId,
  editExtraCount,
  editExtraLoading,
  editExtraError,
  editSaveError,
  sourceLabel,
  targetLabel,
  onChangeAssignTargetId,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onChangeExtraCount,
  onGenerateMore,
  onAssignToWorld,
  onSave,
  onClose,
}: {
  ui: UiCopy
  title: string
  items: ReviewItem[]
  appendableWorlds: Array<{ id: string; title: string; isUploaded: boolean }>
  assignTargetId: string
  editExtraCount: number
  editExtraLoading: boolean
  editExtraError: string | null
  editSaveError: string | null
  sourceLabel: string
  targetLabel: string
  onChangeAssignTargetId: (value: string) => void
  onUpdateItem: (id: string, value: Partial<ReviewItem>) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onChangeExtraCount: (value: number) => void
  onGenerateMore: () => void
  onAssignToWorld: () => void
  onSave: () => void
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
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-neutral-800 p-4 sm:p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
              {ui.worldsOverlay.editTitle}
            </h2>
            <p className="text-sm text-neutral-300 mt-2">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-300">
            <span>{ui.upload.reviewMoreLabel}</span>
            <input
              type="number"
              min={1}
              value={editExtraCount}
              onChange={(e) => onChangeExtraCount(Number(e.target.value))}
              className="w-16 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
            />
            <button
              type="button"
              onClick={onGenerateMore}
              disabled={editExtraLoading}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-50"
            >
              {editExtraLoading ? ui.upload.processing : ui.upload.reviewMoreButton}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-300">
            <span>{ui.worldsOverlay.assignLabel}</span>
            <select
              value={assignTargetId}
              onChange={(e) => onChangeAssignTargetId(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
            >
              <option value="">{ui.worldsOverlay.unlisted}</option>
              {appendableWorlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onAssignToWorld}
              disabled={!assignTargetId}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-50"
            >
              {ui.worldsOverlay.assignAction}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto max-h-[55vh] rounded-xl border border-neutral-800">
          <div className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,1.2fr,1fr,1fr,auto] gap-2 p-3 text-xs uppercase tracking-wide text-neutral-400">
            <div>{ui.upload.reviewInclude}</div>
            <div>{sourceLabel}</div>
            <div>{targetLabel}</div>
            <div>{ui.upload.reviewEmoji}</div>
            <div>{ui.upload.reviewPos}</div>
            <div>{ui.upload.reviewConjugate}</div>
            <div>{ui.upload.reviewExplanation ?? "Explicación"}</div>
            <div>{ui.upload.reviewExample ?? "Ejemplo"}</div>
            <div>{ui.upload.reviewSyllables ?? "Sílabas"}</div>
            <div></div>
          </div>
          <div className="divide-y divide-neutral-800">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,1.2fr,1fr,1fr,auto] gap-2 p-3 items-center"
              >
                <input
                  type="checkbox"
                  checked={item.include}
                  onChange={(e) => onUpdateItem(item.id, { include: e.target.checked })}
                />
                <input
                  type="text"
                  value={item.source}
                  onChange={(e) => onUpdateItem(item.id, { source: e.target.value })}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <input
                  type="text"
                  value={item.target}
                  onChange={(e) => onUpdateItem(item.id, { target: e.target.value })}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <input
                  type="text"
                  value={item.emoji ?? ""}
                  onChange={(e) => onUpdateItem(item.id, { emoji: e.target.value })}
                  className="w-12 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-center text-sm text-neutral-100"
                />
                <select
                  value={item.pos}
                  onChange={(e) =>
                    onUpdateItem(item.id, {
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
                  onChange={(e) => onUpdateItem(item.id, { conjugate: e.target.checked })}
                />
                <input
                  type="text"
                  value={item.explanation ?? ""}
                  onChange={(e) => onUpdateItem(item.id, { explanation: e.target.value })}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <input
                  type="text"
                  value={item.example ?? ""}
                  onChange={(e) => onUpdateItem(item.id, { example: e.target.value })}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <input
                  type="text"
                  value={item.syllables ?? ""}
                  onChange={(e) => onUpdateItem(item.id, { syllables: e.target.value })}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
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
          onClick={onAddItem}
          className="mt-3 text-sm text-neutral-300 hover:text-white"
        >
          {ui.upload.reviewAddRow}
        </button>

        {(editExtraError || editSaveError) && (
          <div className="mt-3 text-sm text-red-400">{editExtraError || editSaveError}</div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
          >
            {ui.upload.reviewBack}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30"
          >
            {ui.upload.reviewDone}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function UploadOverlay({
  ui,
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
  newsUrl,
  sourceLabel,
  targetLabel,
  onChangeName,
  onChangeText,
  onChangeTab,
  onChangeModeSelection,
  onChangeTargetWorldId,
  onChangeThemeText,
  onChangeThemeCount,
  onChangeNewsUrl,
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
  reviewExtraCount,
  reviewExtraLoading,
  reviewExtraError,
  onChangeReviewExtraCount,
  onGenerateMoreReview,
  onRestoreWorld,
  onClose,
  onSubmit,
  onSubmitReview,
}: {
  ui: UiCopy
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
  newsUrl: string
  sourceLabel: string
  targetLabel: string
  onChangeName: (value: string) => void
  onChangeText: (value: string) => void
  onChangeTab: (value: UploadTab) => void
  onChangeModeSelection: (value: UploadModeSelection) => void
  onChangeTargetWorldId: (value: string) => void
  onChangeThemeText: (value: string) => void
  onChangeThemeCount: (value: number) => void
  onChangeNewsUrl: (value: string) => void
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
  reviewExtraCount: number
  reviewExtraLoading: boolean
  reviewExtraError: string | null
  onChangeReviewExtraCount: (value: number) => void
  onGenerateMoreReview: () => void
  onRestoreWorld: (id: string) => void
  onClose: () => void
  onSubmit: () => void
  onSubmitReview: () => void
}) {
  const selectedTarget = appendableWorlds.find((world) => world.id === targetWorldId)
  const isAppendingExisting = Boolean(selectedTarget?.isUploaded)
  const tabs: Array<{ id: UploadTab; label: string }> = [
    { id: "theme", label: ui.upload.tabTheme },
    { id: "table", label: ui.upload.tabTable },
    { id: "upload", label: ui.upload.tabUpload },
    { id: "news", label: ui.upload.tabNews },
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
              <div className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,1.2fr,1fr,1fr,auto] gap-2 p-3 text-xs uppercase tracking-wide text-neutral-400">
                <div>{ui.upload.reviewInclude}</div>
                <div>{sourceLabel}</div>
                <div>{targetLabel}</div>
                <div>{ui.upload.reviewEmoji}</div>
                <div>{ui.upload.reviewPos}</div>
                <div>{ui.upload.reviewConjugate}</div>
                <div>{ui.upload.reviewExplanation ?? "Explicación"}</div>
                <div>{ui.upload.reviewExample ?? "Ejemplo"}</div>
                <div>{ui.upload.reviewSyllables ?? "Sílabas"}</div>
                <div></div>
              </div>
              <div className="divide-y divide-neutral-800">
                {reviewItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[auto,1fr,1fr,auto,auto,auto,1.2fr,1fr,1fr,auto] gap-2 p-3 items-center"
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
                    <input
                      type="text"
                      value={item.explanation ?? ""}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { explanation: e.target.value })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                    />
                    <input
                      type="text"
                      value={item.example ?? ""}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { example: e.target.value })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                    />
                    <input
                      type="text"
                      value={item.syllables ?? ""}
                      onChange={(e) =>
                        onUpdateReviewItem(item.id, { syllables: e.target.value })
                      }
                      className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
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

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAddReviewItem}
                className="text-sm text-neutral-300 hover:text-white"
              >
                {ui.upload.reviewAddRow}
              </button>
              <div className="flex items-center gap-2 text-xs text-neutral-300">
                <span>{ui.upload.reviewMoreLabel}</span>
                <input
                  type="number"
                  min={1}
                  value={reviewExtraCount}
                  onChange={(e) => onChangeReviewExtraCount(Number(e.target.value))}
                  className="w-16 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100"
                />
                <button
                  type="button"
                  onClick={onGenerateMoreReview}
                  disabled={reviewExtraLoading}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200 disabled:opacity-50"
                >
                  {reviewExtraLoading ? ui.upload.processing : ui.upload.reviewMoreButton}
                </button>
              </div>
            </div>

            {(error || reviewExtraError) && (
              <div className="mt-3 text-sm text-red-400">{reviewExtraError || error}</div>
            )}

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
                    <div>{sourceLabel}</div>
                    <div>{targetLabel}</div>
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr,120px]">
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
                  </div>
                </div>
              )}

              {tab === "news" && (
                <div>
                  <label className="text-sm text-neutral-300">{ui.upload.newsLabel}</label>
                  <input
                    type="url"
                    value={newsUrl}
                    onChange={(e) => onChangeNewsUrl(e.target.value)}
                    placeholder={ui.upload.newsPlaceholder}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                  />
                  <div className="mt-2 text-xs text-neutral-400">{ui.upload.newsHint}</div>
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
  ui,
  lists,
  selectedListId,
  newListName,
  onChangeNewListName,
  onSelectList,
  onCreateList,
  onClose,
}: {
  ui: UiCopy
  lists: WorldList[]
  selectedListId: string
  newListName: string
  onChangeNewListName: (value: string) => void
  onSelectList: (id: string) => void
  onCreateList: () => void
  onClose: () => void
  bestScores: Record<string, number>
}) {
  const safeLists = useMemo(
    () =>
      Array.isArray(lists)
        ? lists.filter((list) => list && typeof list.id === "string")
        : [],
    [lists]
  )

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
          {safeLists.map((list) => (
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
  ui,
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
  onEditWorld,
  onDeleteWorld,
  onDeleteList,
  collapsedListIds,
  onSetCollapsedListIds,
  activeWorldId,
  onClose,
  onSelectWorld,
  promptText,
  promptError,
  promptLoading,
  promptSuggestions,
  promptPlaceholder,
  onPromptChange,
  onPromptSubmit,
  bestScores,
}: {
  ui: UiCopy
  worlds: Array<World>
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
  onEditWorld: (worldId: string) => void
  onDeleteWorld: (worldId: string) => void
  onDeleteList: (listId: string) => void
  activeWorldId: string
  onClose: () => void
  onSelectWorld: (id: string) => void
  promptText: string
  promptError: string | null
  promptLoading: boolean
  promptSuggestions: string[]
  promptPlaceholder: string
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  bestScores: Record<string, number>
}) {
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)
  const [editingWorldTitle, setEditingWorldTitle] = useState("")
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListTitle, setEditingListTitle] = useState("")
  const [openMenuWorldId, setOpenMenuWorldId] = useState<string | null>(null)
  const [openMenuListId, setOpenMenuListId] = useState<string | null>(null)
  const [movingWorldId, setMovingWorldId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<
    | { type: "world"; id: string }
    | { type: "list"; id: string; count: number }
    | null
  >(null)

  const safeWorlds = useMemo(
    () => (Array.isArray(worlds) ? worlds.filter((w) => w && typeof w.id === "string") : []),
    [worlds]
  )
  const safeLists = useMemo(
    () =>
      Array.isArray(lists)
        ? lists.filter((list) => list && typeof list.id === "string")
        : [],
    [lists]
  )
  const worldById = useMemo(() => new Map(safeWorlds.map((w) => [w.id, w])), [safeWorlds])
  const listIdByWorld = useMemo(() => {
    const map = new Map<string, string>()
    lists.forEach((list) => {
      list.worldIds.forEach((id) => {
        if (!map.has(id)) map.set(id, list.id)
      })
    })
    return map
  }, [safeLists])

  const unlistedWorlds = useMemo(
    () => safeWorlds.filter((w) => !listIdByWorld.has(w.id)),
    [safeWorlds, listIdByWorld]
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

        {worlds.length === 0 && (
          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-semibold text-neutral-100">
              Crea tu primer mundo
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {promptSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    onPromptChange(suggestion)
                  }}
                  className="rounded-full border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-100 hover:border-neutral-500"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                type="text"
                value={promptText}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onPromptSubmit()
                  }
                }}
                placeholder={promptPlaceholder}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
              {promptError && (
                <div className="mt-2 text-xs text-red-300">{promptError}</div>
              )}
              <button
                type="button"
                onClick={onPromptSubmit}
                disabled={promptLoading}
                className="mt-3 rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
              >
                {promptLoading ? ui.upload.processing : ui.upload.actionGenerate}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-5 max-h-[55vh] overflow-auto pr-1">
          {safeLists.map((list) => {
            const listWorlds = list.worldIds
              .map((id) => worldById.get(id))
              .filter(Boolean) as Array<{ id: string; title: string; description?: string }>

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
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuListId((prev) => (prev === list.id ? null : list.id))
                        }}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                      >
                        ⋯
                      </button>
                      {openMenuListId === list.id && (
                        <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-200">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuListId(null)
                              setConfirmingDelete({
                                type: "list",
                                id: list.id,
                                count: list.worldIds.length,
                              })
                            }}
                            className="w-full rounded-md px-2 py-1 text-left text-red-200 hover:bg-red-500/10"
                          >
                            {ui.worldsOverlay.deleteListLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {!collapsedListIds[list.id] && (
                  <div className="space-y-3">
                    {listWorlds.map((w, idx) => {
                      const active = w.id === activeWorldId
                      const title = getWorldTitle(w.id, w.title)
                      const chunkSize = w.chunking?.itemsPerGame ?? 8
                      const totalLevels = Math.ceil((w.pool?.length ?? 0) / chunkSize)
                      let isComplete = totalLevels > 0
                      for (let i = 0; i < totalLevels; i++) {
                        if ((bestScores[`${w.id}:${i}`] || 0) <= 0) {
                          isComplete = false
                          break
                        }
                      }

                      return (
                        <div
                          key={w.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectWorld(w.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              onSelectWorld(w.id)
                            }
                          }}
                          className={[
                            "w-full text-left rounded-2xl border p-4 transition cursor-pointer",
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
                                <div className="text-base font-semibold text-neutral-50">
                                  {title}
                                  {isComplete && <span className="ml-2 text-green-400">✅</span>}
                                </div>
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
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenuWorldId((prev) => (prev === w.id ? null : w.id))
                                  setMovingWorldId(null)
                                }}
                                className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                              >
                                ⋯
                              </button>
                              {openMenuWorldId === w.id && (
                                <div className="absolute right-0 top-8 z-10 w-32 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-200">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenMenuWorldId(null)
                                      onEditWorld(w.id)
                                    }}
                                    className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                  >
                                    {ui.worldsOverlay.editLabel}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMovingWorldId((prev) => (prev === w.id ? null : w.id))
                                    }}
                                    className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                  >
                                    {ui.worldsOverlay.moveLabel}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenMenuWorldId(null)
                                      setConfirmingDelete({ type: "world", id: w.id })
                                    }}
                                    className="w-full rounded-md px-2 py-1 text-left text-red-200 hover:bg-red-500/10"
                                  >
                                    {ui.worldsOverlay.deleteLabel}
                                  </button>
                                  {movingWorldId === w.id && (
                                    <div className="mt-2 border-t border-neutral-800 pt-2">
                                      <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                                        {ui.worldsOverlay.moveToLabel}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onAssignWorldToList(w.id, null)
                                          setOpenMenuWorldId(null)
                                          setMovingWorldId(null)
                                        }}
                                        className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                      >
                                        {ui.worldsOverlay.unlisted}
                                      </button>
                                      {safeLists.map((opt) => (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onAssignWorldToList(w.id, opt.id)
                                            setOpenMenuWorldId(null)
                                            setMovingWorldId(null)
                                          }}
                                          className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                        >
                                          {opt.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
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
                              {safeLists.map((opt) => (
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
                        </div>
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
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectWorld(w.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onSelectWorld(w.id)
                        }
                      }}
                      className={[
                        "w-full text-left rounded-2xl border p-4 transition cursor-pointer",
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
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuWorldId((prev) => (prev === w.id ? null : w.id))
                              setMovingWorldId(null)
                            }}
                            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-200"
                          >
                            ⋯
                          </button>
                          {openMenuWorldId === w.id && (
                            <div className="absolute right-0 top-8 z-10 w-32 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-200">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenuWorldId(null)
                                  onEditWorld(w.id)
                                }}
                                className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                              >
                                {ui.worldsOverlay.editLabel}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMovingWorldId((prev) => (prev === w.id ? null : w.id))
                                }}
                                className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                              >
                                {ui.worldsOverlay.moveLabel}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenuWorldId(null)
                                  setConfirmingDelete({ type: "world", id: w.id })
                                }}
                                className="w-full rounded-md px-2 py-1 text-left text-red-200 hover:bg-red-500/10"
                              >
                                {ui.worldsOverlay.deleteLabel}
                              </button>
                              {movingWorldId === w.id && (
                                <div className="mt-2 border-t border-neutral-800 pt-2">
                                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                                    {ui.worldsOverlay.moveToLabel}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onAssignWorldToList(w.id, null)
                                      setOpenMenuWorldId(null)
                                      setMovingWorldId(null)
                                    }}
                                    className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                  >
                                    {ui.worldsOverlay.unlisted}
                                  </button>
                                  {safeLists.map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        onAssignWorldToList(w.id, opt.id)
                                        setOpenMenuWorldId(null)
                                        setMovingWorldId(null)
                                      }}
                                      className="w-full rounded-md px-2 py-1 text-left hover:bg-neutral-800"
                                    >
                                      {opt.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
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
                            {safeLists.map((opt) => (
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
                    </div>
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

        {confirmingDelete && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setConfirmingDelete(null)
              }
            }}
          >
            <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-100 shadow-xl">
              <div className="text-base font-semibold text-neutral-50">
                {confirmingDelete.type === "world"
                  ? ui.worldsOverlay.deleteWorldConfirm
                  : formatTemplate(ui.worldsOverlay.deleteListConfirm, {
                      count: confirmingDelete.count,
                    })}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(null)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-200 hover:text-white"
                >
                  {ui.worldsOverlay.confirmCancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmingDelete.type === "world") {
                      onDeleteWorld(confirmingDelete.id)
                    } else {
                      onDeleteList(confirmingDelete.id)
                    }
                    setConfirmingDelete(null)
                  }}
                  className="rounded-lg border border-red-500/40 bg-red-600/20 px-3 py-2 text-xs text-red-100 hover:bg-red-600/30"
                >
                  {ui.worldsOverlay.confirmYes}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function LevelsOverlay({
  ui,
  world,
  displayTitle,
  activeLevelIndex,
  onClose,
  onSelectLevel,
}: {
  ui: UiCopy
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

function normalizePos(pos: any) {
  return pos === "verb" || pos === "noun" || pos === "adj" ? pos : "other"
}
