<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  Tooltip
} from "chart.js";
import type { Board } from "../../shared/types/board";
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus
} from "../../shared/types/inventory";
import type { BoardPartition } from "../../shared/types/partition";
import { useBoardStore } from "../stores/boardStore";
import { useProjectChecklistStore } from "../stores/projectChecklistStore";
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  useProjectStore
} from "../stores/projectStore";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_ICONS,
  BOARD_STATUS_LABELS,
  formatBytes,
  formatDate
} from "../utils/boardDisplay";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  LinearScale,
  Tooltip
);

interface FilesystemMetric {
  key: string;
  label: string;
  bytes: number;
  color: string;
}

interface OpenFlashBoardMetric {
  board: Board;
  openBytes: number;
  partitionedBytes: number;
  openPercent: number;
}

interface PartitionInsights {
  boardsWithPartitions: number;
  failedBoards: number;
  missingBoards: number;
  otaReadyBoards: number;
  openBytes: number;
  partitionedBytes: number;
  partitionRows: number;
  filesystemMetrics: FilesystemMetric[];
  topOpenFlashBoards: OpenFlashBoardMetric[];
}

interface ScanFreshnessMetric {
  key: string;
  label: string;
  detail: string;
  count: number;
  percent: number;
  color: string;
}

interface LabOrganizationMetric {
  key: string;
  label: string;
  detail: string;
  availableCount: number;
  inUseCount: number;
  attentionCount: number;
  archivedCount: number;
  total: number;
}

interface MemoryInventoryMetric {
  key: string;
  label: string;
  bytes: number;
  knownBoards: number;
  color: string;
}

interface BoardStateMetric {
  status: Board["status"];
  label: string;
  displayLabel: string;
  count: number;
  color: string;
}

interface ProjectStatusMetric {
  status: ProjectStatus;
  label: string;
  count: number;
  color: string;
}

interface ProjectInsightMetric {
  project: Project;
  assignedBoards: number;
  attentionBoards: number;
  openChecklistItems: number;
  totalChecklistItems: number;
}

const boardStore = useBoardStore();
const checklistStore = useProjectChecklistStore();
const projectStore = useProjectStore();
const isDevelopmentMode = import.meta.env.DEV;
const { boards, dashboardStats, error } = storeToRefs(boardStore);
const { items: checklistItems } = storeToRefs(checklistStore);
const { projects } = storeToRefs(projectStore);
const emit = defineEmits<{
  "open-boards": [];
  "open-board": [id: string];
  "open-project": [id: string];
}>();
const chipFamilyChartCanvas = ref<HTMLCanvasElement | null>(null);
const projectStatusChartCanvas = ref<HTMLCanvasElement | null>(null);
const partitionFlashChartCanvas = ref<HTMLCanvasElement | null>(null);
const openFlashChartCanvas = ref<HTMLCanvasElement | null>(null);
const knownMemoryChartCanvas = ref<HTMLCanvasElement | null>(null);
const boardStateChartCanvas = ref<HTMLCanvasElement | null>(null);
const labOrganizationChartCanvas = ref<HTMLCanvasElement | null>(null);
let chipFamilyChart: Chart<"doughnut"> | null = null;
let projectStatusChart: Chart<"doughnut"> | null = null;
let partitionFlashChart: Chart<"doughnut"> | null = null;
let openFlashChart: Chart<"bar"> | null = null;
let knownMemoryChart: Chart<"bar"> | null = null;
let boardStateChart: Chart<"bar"> | null = null;
let labOrganizationChart: Chart<"bar"> | null = null;
let themeObserver: MutationObserver | null = null;

const chipFamilyPalette = [
  "#2dd4bf",
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#fb7185",
  "#84cc16"
];
const filesystemPalette = {
  fatfs: "#60a5fa",
  littlefs: "#38bdf8",
  spiffs: "#818cf8"
};
const memoryPalette = {
  flash: "#2dd4bf",
  psram: "#a78bfa"
};
const boardStatePalette: Record<Board["status"], string> = {
  available: "#22c55e",
  in_use: "#38bdf8",
  needs_flashing: "#f59e0b",
  broken: "#fb7185",
  archived: "#94a3b8",
  unknown: "#a78bfa"
};
const projectStatusPalette: Record<ProjectStatus, string> = {
  active: "#2dd4bf",
  needs_repair: "#fb7185",
  on_hold: "#f59e0b",
  completed: "#38bdf8",
  archived: "#94a3b8"
};
const labOrganizationPalette = {
  available: "#22c55e",
  inUse: "#38bdf8",
  attention: "#f59e0b",
  archived: "#94a3b8"
};
const boardStatusChartOrder: Board["status"][] = [
  "available",
  "in_use",
  "needs_flashing",
  "broken",
  "unknown",
  "archived"
];
const DEFAULT_PARTITION_TABLE_OFFSET = 0x8000;
const PARTITION_TABLE_REGION_SIZE = 0x1000;

const totalBoards = computed(() => dashboardStats.value?.totalBoards ?? boards.value.length);
const availableBoards = computed(() => dashboardStats.value?.availableBoards ?? 0);
const inUseBoards = computed(() => dashboardStats.value?.inUseBoards ?? 0);
const totalFlashBytes = computed(() =>
  boards.value.reduce((total, board) => total + (board.flashSizeBytes ?? 0), 0)
);
const totalPsramBytes = computed(() =>
  boards.value.reduce((total, board) => total + (board.psramSizeBytes ?? 0), 0)
);
const boardsWithKnownFlash = computed(
  () => boards.value.filter((board) => board.flashSizeBytes !== null).length
);
const boardsWithKnownPsram = computed(
  () => boards.value.filter((board) => board.psramSizeBytes !== null).length
);
const totalKnownMemoryBytes = computed(
  () => totalFlashBytes.value + totalPsramBytes.value
);
const memoryInventoryMetrics = computed<MemoryInventoryMetric[]>(() => [
  {
    key: "flash",
    label: "Flash",
    bytes: totalFlashBytes.value,
    knownBoards: boardsWithKnownFlash.value,
    color: memoryPalette.flash
  },
  {
    key: "psram",
    label: "PSRAM",
    bytes: totalPsramBytes.value,
    knownBoards: boardsWithKnownPsram.value,
    color: memoryPalette.psram
  }
]);
const hasKnownMemory = computed(() =>
  memoryInventoryMetrics.value.some((metric) => metric.bytes > 0)
);
const knownMemoryChartKey = computed(() =>
  memoryInventoryMetrics.value
    .map((metric) => `${metric.key}:${metric.bytes}:${metric.knownBoards}`)
    .join("|")
);
const boardsNeedingAttention = computed(
  () =>
    boards.value.filter((board) =>
      ["broken", "needs_flashing", "unknown"].includes(board.status)
    ).length
);
const readyBoards = computed(() => availableBoards.value + inUseBoards.value);
const readyBoardPercent = computed(() => getPercent(readyBoards.value, totalBoards.value));
const boardStateMetrics = computed<BoardStateMetric[]>(() => {
  const counts = new Map<Board["status"], number>();

  for (const board of boards.value) {
    counts.set(board.status, (counts.get(board.status) ?? 0) + 1);
  }

  return boardStatusChartOrder.map((status) => {
    const label = BOARD_STATUS_LABELS[status];
    return {
      status,
      label,
      displayLabel: label.toLocaleLowerCase(),
      count: counts.get(status) ?? 0,
      color: boardStatePalette[status]
    };
  });
});
const visibleBoardStateMetrics = computed(() =>
  boardStateMetrics.value.filter(
    (metric) =>
      metric.count > 0 ||
      metric.status === "available" ||
      metric.status === "in_use" ||
      metric.status === "broken"
  )
);
const boardStateChartKey = computed(() =>
  boardStateMetrics.value
    .map((metric) => `${metric.status}:${metric.count}`)
    .join("|")
);
const unassignedBoards = computed(
  () => boards.value.filter((board) => !board.projectId).length
);
const assignedBoards = computed(() =>
  Math.max(totalBoards.value - unassignedBoards.value, 0)
);
const organizedBoardPercent = computed(() =>
  getPercent(assignedBoards.value, totalBoards.value)
);
const projectGroupsInUse = computed(
  () =>
    new Set(
      boards.value
        .map((board) => board.projectId)
        .filter((projectId): projectId is string => Boolean(projectId))
    ).size
);
const activeProjects = computed(
  () => projects.value.filter((project) => project.status === "active").length
);
const projectsWithBoards = computed(
  () =>
    projects.value.filter((project) =>
      boards.value.some((board) => board.projectId === project.id)
    ).length
);
const projectCoveragePercent = computed(() =>
  getPercent(projectsWithBoards.value, projects.value.length)
);
const openProjectChecklistItems = computed(
  () => checklistItems.value.filter((item) => !item.completed).length
);
const projectStatusMetrics = computed<ProjectStatusMetric[]>(() =>
  PROJECT_STATUSES.map((status) => ({
    status,
    label: PROJECT_STATUS_LABELS[status],
    count: projects.value.filter((project) => project.status === status).length,
    color: projectStatusPalette[status]
  })).filter((metric) => metric.count > 0)
);
const projectStatusChartKey = computed(() =>
  projectStatusMetrics.value
    .map((metric) => `${metric.status}:${metric.count}`)
    .join("|")
);
const allProjectInsightMetrics = computed<ProjectInsightMetric[]>(() =>
  projects.value
    .map((project) => {
      const projectBoards = boards.value.filter(
        (board) => board.projectId === project.id
      );
      const projectChecklistItems = checklistItems.value.filter(
        (item) => item.projectId === project.id
      );

      return {
        project,
        assignedBoards: projectBoards.length,
        attentionBoards: projectBoards.filter((board) =>
          ["broken", "needs_flashing", "unknown"].includes(board.status)
        ).length,
        openChecklistItems: projectChecklistItems.filter((item) => !item.completed)
          .length,
        totalChecklistItems: projectChecklistItems.length
      };
    })
    .sort(
      (left, right) =>
        right.attentionBoards - left.attentionBoards ||
        right.openChecklistItems - left.openChecklistItems ||
        right.assignedBoards - left.assignedBoards ||
        left.project.name.localeCompare(right.project.name)
    )
);
const projectInsightMetrics = computed<ProjectInsightMetric[]>(() =>
  allProjectInsightMetrics.value.slice(0, 4)
);
const projectsNeedingAttention = computed(
  () =>
    allProjectInsightMetrics.value.filter(
      (metric) =>
        metric.project.status === "needs_repair" ||
        metric.attentionBoards > 0 ||
        metric.openChecklistItems > 0
    ).length
);
const labOrganizationMetrics = computed<LabOrganizationMetric[]>(() => {
  const metrics = new Map<string, LabOrganizationMetric>();
  const projectMap = new Map(projects.value.map((project) => [project.id, project]));

  for (const board of boards.value) {
    const project = board.projectId ? projectMap.get(board.projectId) : null;
    const key = project?.id ?? (board.projectId ? `missing-${board.projectId}` : "unassigned");
    const metric =
      metrics.get(key) ??
      createLabOrganizationMetric(
        key,
        project?.name ?? (board.projectId ? "Missing project" : "Unassigned"),
        project?.location ??
          (project
            ? projectStore.getStatusLabel(project.status)
            : board.projectId
              ? "Detached board"
              : "Needs project")
      );

    countLabOrganizationBoard(metric, board);
    metrics.set(key, metric);
  }

  return Array.from(metrics.values())
    .sort((left, right) => {
      if (left.key === "unassigned" && right.key !== "unassigned") return -1;
      if (right.key === "unassigned" && left.key !== "unassigned") return 1;
      return right.total - left.total || left.label.localeCompare(right.label);
    })
    .slice(0, 5);
});
const labOrganizationChartKey = computed(() =>
  labOrganizationMetrics.value
    .map(
      (metric) =>
        `${metric.key}:${metric.label}:${metric.detail}:${metric.availableCount}:${metric.inUseCount}:${metric.attentionCount}:${metric.archivedCount}`
    )
    .join("|")
);
const chipFamilyMetrics = computed(() => {
  const counts = new Map<string, number>();

  for (const board of boards.value) {
    const chipFamily = formatChipFamily(board);
    counts.set(chipFamily, (counts.get(chipFamily) ?? 0) + 1);
  }

  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label)
  );
});
const chipFamilyChartMetrics = computed(() => chipFamilyMetrics.value.slice(0, 7));
const dominantChipFamily = computed(() => chipFamilyMetrics.value[0]?.label ?? "No chip data");
const chipFamilyCount = computed(() => chipFamilyMetrics.value.length);
const scanFreshnessMetrics = computed<ScanFreshnessMetric[]>(() => {
  const total = boards.value.length;
  const now = Date.now();
  const freshThresholdMs = 14 * 24 * 60 * 60 * 1000;
  let fresh = 0;
  let stale = 0;
  let never = 0;

  for (const board of boards.value) {
    const scannedAt = parseDateMs(board.lastScannedAt);

    if (scannedAt === null) {
      never += 1;
      continue;
    }

    if (now - scannedAt <= freshThresholdMs) {
      fresh += 1;
    } else {
      stale += 1;
    }
  }

  return [
    {
      key: "fresh",
      label: "Fresh scans",
      detail: "Last 14 days",
      count: fresh,
      percent: getPercent(fresh, total),
      color: "#2dd4bf"
    },
    {
      key: "stale",
      label: "Stale scans",
      detail: "Older scan data",
      count: stale,
      percent: getPercent(stale, total),
      color: "#f59e0b"
    },
    {
      key: "never",
      label: "Never scanned",
      detail: "Manual or unknown",
      count: never,
      percent: getPercent(never, total),
      color: "#94a3b8"
    }
  ];
});
const latestScanDate = computed(() => {
  const latest = Math.max(
    ...boards.value
      .map((board) => parseDateMs(board.lastScannedAt))
      .filter((value): value is number => value !== null)
  );

  return Number.isFinite(latest) ? formatDate(new Date(latest).toISOString()) : "No scans yet";
});
const psramEquippedBoards = computed(
  () =>
    boards.value.filter(
      (board) =>
        (board.psramSizeBytes !== null && board.psramSizeBytes > 0) ||
        board.psramDetected === true
    ).length
);
const averageFlashBytes = computed(() =>
  boardsWithKnownFlash.value > 0
    ? Math.round(totalFlashBytes.value / boardsWithKnownFlash.value)
    : 0
);
const largestFlashBoard = computed(() =>
  boards.value
    .filter(
      (board): board is Board & { flashSizeBytes: number } =>
        board.flashSizeBytes !== null && board.flashSizeBytes > 0
    )
    .sort((left, right) => right.flashSizeBytes - left.flashSizeBytes)[0] ?? null
);
const partitionInsights = computed<PartitionInsights>(() => {
  const filesystemBytes = new Map<string, FilesystemMetric>();
  let boardsWithPartitions = 0;
  let failedBoards = 0;
  let otaReadyBoards = 0;
  let openBytes = 0;
  let partitionedBytes = 0;
  let partitionRows = 0;
  const topOpenFlashBoards: OpenFlashBoardMetric[] = [];

  for (const board of boards.value) {
    const partitions = board.partitions ?? [];

    if (!partitions.length) {
      if (board.partitionTableReadError) {
        failedBoards += 1;
      }
      continue;
    }

    boardsWithPartitions += 1;
    partitionRows += partitions.length;

    if (isOtaReady(board)) {
      otaReadyBoards += 1;
    }

    const boardPartitionedBytes = partitions.reduce(
      (total, partition) => total + Math.max(partition.sizeBytes, 0),
      0
    );
    const boardOpenBytes = getOpenFlashBytes(board, boardPartitionedBytes);
    const denominator = boardPartitionedBytes + boardOpenBytes;

    partitionedBytes += boardPartitionedBytes;
    openBytes += boardOpenBytes;

    if (boardOpenBytes > 0) {
      topOpenFlashBoards.push({
        board,
        openBytes: boardOpenBytes,
        partitionedBytes: boardPartitionedBytes,
        openPercent: denominator > 0 ? (boardOpenBytes / denominator) * 100 : 0
      });
    }

    for (const partition of partitions) {
      const filesystem = getFilesystemMetric(partition);
      if (!filesystem) {
        continue;
      }

      const current = filesystemBytes.get(filesystem.key) ?? filesystem;
      filesystemBytes.set(filesystem.key, {
        ...current,
        bytes: current.bytes + partition.sizeBytes
      });
    }
  }

  return {
    boardsWithPartitions,
    failedBoards,
    missingBoards: Math.max(boards.value.length - boardsWithPartitions - failedBoards, 0),
    otaReadyBoards,
    openBytes,
    partitionedBytes,
    partitionRows,
    filesystemMetrics: Array.from(filesystemBytes.values()).sort(
      (left, right) => right.bytes - left.bytes
    ),
    topOpenFlashBoards: topOpenFlashBoards
      .sort((left, right) => right.openBytes - left.openBytes)
      .slice(0, 5)
  };
});
const partitionedFlashPercent = computed(() => {
  const total =
    partitionInsights.value.partitionedBytes + partitionInsights.value.openBytes;
  return total > 0
    ? Math.round((partitionInsights.value.partitionedBytes / total) * 100)
    : 0;
});
const otaReadyPercent = computed(() =>
  partitionInsights.value.boardsWithPartitions > 0
    ? Math.round(
        (partitionInsights.value.otaReadyBoards /
          partitionInsights.value.boardsWithPartitions) *
          100
      )
    : 0
);
const averagePartitionsPerBoard = computed(() =>
  partitionInsights.value.boardsWithPartitions > 0
    ? (
        partitionInsights.value.partitionRows /
        partitionInsights.value.boardsWithPartitions
      ).toFixed(1)
    : "0"
);
const partitionChartKey = computed(() => {
  const insights = partitionInsights.value;
  return [
    insights.partitionedBytes,
    insights.openBytes,
    insights.boardsWithPartitions,
    insights.failedBoards,
    insights.missingBoards,
    insights.otaReadyBoards,
    insights.filesystemMetrics
      .map((metric) => `${metric.key}:${metric.bytes}`)
      .join(","),
    insights.topOpenFlashBoards
      .map((metric) => `${metric.board.id}:${metric.openBytes}`)
      .join(",")
  ].join("|");
});
const recentActivity = computed(() => {
  const activity = [
    ...(dashboardStats.value?.recentlyConnectedBoards ?? []).map((board) => ({
      board,
      kind: "Connection",
      label: "Connected",
      icon: "mdi-usb-port",
      color: "info",
      date: board.lastConnectedAt
    })),
    ...(dashboardStats.value?.recentlyUpdatedBoards ?? []).map((board) => ({
      board,
      kind: "Record update",
      label: "Updated",
      icon: "mdi-pencil-circle-outline",
      color: "primary",
      date: board.updatedAt
    }))
  ];

  return activity
    .sort(
      (left, right) =>
        new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime()
    )
    .slice(0, 6);
});

onMounted(() => {
  void refreshDashboard();
  themeObserver = new MutationObserver(() => {
    void nextTick(renderDashboardCharts);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-vault-theme"]
  });
  void nextTick(renderDashboardCharts);
});

onBeforeUnmount(() => {
  chipFamilyChart?.destroy();
  projectStatusChart?.destroy();
  partitionFlashChart?.destroy();
  openFlashChart?.destroy();
  knownMemoryChart?.destroy();
  boardStateChart?.destroy();
  labOrganizationChart?.destroy();
  themeObserver?.disconnect();
  chipFamilyChart = null;
  projectStatusChart = null;
  partitionFlashChart = null;
  openFlashChart = null;
  knownMemoryChart = null;
  boardStateChart = null;
  labOrganizationChart = null;
  themeObserver = null;
});

watch(
  chipFamilyChartMetrics,
  () => {
    void nextTick(renderChipFamilyChart);
  },
  { deep: true }
);

watch(
  projectStatusChartKey,
  () => {
    void nextTick(renderProjectStatusChart);
  }
);

watch(
  partitionChartKey,
  () => {
    void nextTick(renderPartitionCharts);
  }
);

watch(
  knownMemoryChartKey,
  () => {
    void nextTick(renderKnownMemoryChart);
  }
);

watch(
  boardStateChartKey,
  () => {
    void nextTick(renderBoardStateChart);
  }
);

watch(
  labOrganizationChartKey,
  () => {
    void nextTick(renderLabOrganizationChart);
  }
);

function renderDashboardCharts(): void {
  renderChipFamilyChart();
  renderProjectStatusChart();
  renderPartitionCharts();
  renderKnownMemoryChart();
  renderBoardStateChart();
  renderLabOrganizationChart();
}

function renderChipFamilyChart(): void {
  const canvas = chipFamilyChartCanvas.value;
  const metrics = chipFamilyChartMetrics.value;

  chipFamilyChart?.destroy();
  chipFamilyChart = null;

  if (!canvas || !metrics.length) {
    return;
  }

  chipFamilyChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: metrics.map((metric) => metric.label),
      datasets: [
        {
          data: metrics.map((metric) => metric.count),
          backgroundColor: metrics.map(
            (_metric, index) => chipFamilyPalette[index % chipFamilyPalette.length]
          ),
          borderColor: getChartBorderColor(),
          borderRadius: 3,
          borderWidth: 4,
          spacing: 2,
          hoverBorderColor: "rgba(255, 255, 255, 0.78)",
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          borderWidth: 1,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const label = context.label || "Unknown";
              const value = Number(context.parsed) || 0;
              return `${label}: ${value} board${value === 1 ? "" : "s"}`;
            }
          }
        }
      }
    }
  });
}

function renderProjectStatusChart(): void {
  const canvas = projectStatusChartCanvas.value;
  const metrics = projectStatusMetrics.value;

  projectStatusChart?.destroy();
  projectStatusChart = null;

  if (!canvas || !metrics.length) {
    return;
  }

  projectStatusChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: metrics.map((metric) => metric.label),
      datasets: [
        {
          data: metrics.map((metric) => metric.count),
          backgroundColor: metrics.map((metric) => metric.color),
          borderColor: getChartBorderColor(),
          borderRadius: 3,
          borderWidth: 4,
          spacing: 2,
          hoverBorderColor: "rgba(255, 255, 255, 0.78)",
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "67%",
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed) || 0;
              return `${context.label}: ${value} project${value === 1 ? "" : "s"}`;
            }
          }
        }
      }
    }
  });
}

function renderPartitionCharts(): void {
  renderPartitionFlashChart();
  renderOpenFlashChart();
}

function renderPartitionFlashChart(): void {
  const canvas = partitionFlashChartCanvas.value;
  const insights = partitionInsights.value;
  const total = insights.partitionedBytes + insights.openBytes;

  partitionFlashChart?.destroy();
  partitionFlashChart = null;

  if (!canvas || total <= 0) {
    return;
  }

  partitionFlashChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Partitioned flash", "Open flash"],
      datasets: [
        {
          data: [insights.partitionedBytes, insights.openBytes],
          backgroundColor: ["#2dd4bf", "#f59e0b"],
          borderColor: getChartBorderColor(),
          borderRadius: 3,
          borderWidth: 4,
          spacing: 2,
          hoverBorderColor: "rgba(255, 255, 255, 0.78)",
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed) || 0;
              return `${context.label}: ${formatBytes(value)}`;
            }
          }
        }
      }
    }
  });
}

function renderOpenFlashChart(): void {
  const canvas = openFlashChartCanvas.value;
  const metrics = partitionInsights.value.topOpenFlashBoards;

  openFlashChart?.destroy();
  openFlashChart = null;

  if (!canvas || !metrics.length) {
    return;
  }

  openFlashChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.board.name),
      datasets: [
        {
          label: "Open flash",
          data: metrics.map((metric) => metric.openBytes),
          backgroundColor: metrics.map(
            (_metric, index) => chipFamilyPalette[index % chipFamilyPalette.length]
          ),
          borderRadius: 6,
          barThickness: 16
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            afterLabel: (context) => {
              const metric = metrics[context.dataIndex];
              return metric
                ? `${Math.round(metric.openPercent)}% of available flash is open`
                : "";
            },
            label: (context) => `Open flash: ${formatBytes(Number(context.raw) || 0)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: getChartGridColor()
          },
          ticks: {
            color: getChartMutedColor(),
            callback: (value) => formatBytes(Number(value) || 0)
          }
        },
        y: {
          display: false,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function renderKnownMemoryChart(): void {
  const canvas = knownMemoryChartCanvas.value;
  const metrics = memoryInventoryMetrics.value;

  knownMemoryChart?.destroy();
  knownMemoryChart = null;

  if (!canvas || !hasKnownMemory.value) {
    return;
  }

  knownMemoryChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.label),
      datasets: [
        {
          label: "Recorded memory",
          data: metrics.map((metric) => metric.bytes),
          backgroundColor: metrics.map((metric) => metric.color),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 18
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            afterLabel: (context) => {
              const metric = metrics[context.dataIndex];
              return metric
                ? `${formatRecordedCount(metric.knownBoards)}`
                : "";
            },
            label: (context) =>
              `${context.label}: ${formatBytes(Number(context.raw) || 0)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: getChartGridColor()
          },
          ticks: {
            color: getChartMutedColor(),
            callback: (value) => formatBytes(Number(value) || 0)
          }
        },
        y: {
          display: false,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function renderBoardStateChart(): void {
  const canvas = boardStateChartCanvas.value;
  const metrics = boardStateMetrics.value;

  boardStateChart?.destroy();
  boardStateChart = null;

  if (!canvas || totalBoards.value <= 0) {
    return;
  }

  boardStateChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Board state"],
      datasets: metrics.map((metric) => ({
        label: metric.label,
        data: [metric.count],
        backgroundColor: metric.color,
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 24
      }))
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            label: (context) => {
              const value = Number(context.raw) || 0;
              const label = context.dataset.label ?? "Boards";
              return `${label}: ${formatBoardCount(value)}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          stacked: true,
          grid: {
            color: getChartGridColor()
          },
          ticks: {
            color: getChartMutedColor(),
            precision: 0,
            stepSize: 1
          }
        },
        y: {
          display: false,
          stacked: true,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function renderLabOrganizationChart(): void {
  const canvas = labOrganizationChartCanvas.value;
  const metrics = labOrganizationMetrics.value;

  labOrganizationChart?.destroy();
  labOrganizationChart = null;

  if (!canvas || !metrics.length) {
    return;
  }

  labOrganizationChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.label),
      datasets: [
        {
          label: "Available",
          data: metrics.map((metric) => metric.availableCount),
          backgroundColor: labOrganizationPalette.available,
          borderRadius: 5,
          borderSkipped: false,
          barThickness: 14
        },
        {
          label: "In use",
          data: metrics.map((metric) => metric.inUseCount),
          backgroundColor: labOrganizationPalette.inUse,
          borderRadius: 5,
          borderSkipped: false,
          barThickness: 14
        },
        {
          label: "Needs attention",
          data: metrics.map((metric) => metric.attentionCount),
          backgroundColor: labOrganizationPalette.attention,
          borderRadius: 5,
          borderSkipped: false,
          barThickness: 14
        },
        {
          label: "Archived",
          data: metrics.map((metric) => metric.archivedCount),
          backgroundColor: labOrganizationPalette.archived,
          borderRadius: 5,
          borderSkipped: false,
          barThickness: 14
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          ...getChartTooltipBase(),
          callbacks: {
            afterTitle: (items) => {
              const index = items[0]?.dataIndex;
              return typeof index === "number" ? metrics[index]?.detail ?? "" : "";
            },
            label: (context) => {
              const value = Number(context.raw) || 0;
              const label = context.dataset.label ?? "Boards";
              return `${label}: ${formatBoardCount(value)}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          stacked: true,
          grid: {
            color: getChartGridColor()
          },
          ticks: {
            color: getChartMutedColor(),
            precision: 0,
            stepSize: 1
          }
        },
        y: {
          display: false,
          stacked: true,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

async function refreshDashboard(): Promise<void> {
  await Promise.all([
    boardStore.refresh(),
    projectStore.loadProjects(),
    checklistStore.loadItems()
  ]);
}

function formatRecordedCount(count: number): string {
  const total = boards.value.length;
  return total === 0 ? "No boards recorded" : `${count}/${total} boards recorded`;
}

function formatChipFamily(board: Board): string {
  return board.chipModel?.trim() || board.chipFamilyHex || "Unknown";
}

function parseDateMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPercent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function projectChecklistPercent(metric: ProjectInsightMetric): number {
  return getPercent(
    metric.totalChecklistItems - metric.openChecklistItems,
    metric.totalChecklistItems
  );
}

function projectInsightColor(metric: ProjectInsightMetric): string {
  if (metric.project.status === "needs_repair" || metric.attentionBoards > 0) {
    return "warning";
  }

  if (metric.openChecklistItems > 0) {
    return "info";
  }

  return "success";
}

function projectInsightLabel(metric: ProjectInsightMetric): string {
  if (metric.attentionBoards > 0) {
    return `${metric.attentionBoards} board${metric.attentionBoards === 1 ? "" : "s"} need attention`;
  }

  if (metric.openChecklistItems > 0) {
    return `${metric.openChecklistItems} open task${metric.openChecklistItems === 1 ? "" : "s"}`;
  }

  return "On track";
}

function createLabOrganizationMetric(
  key: string,
  label: string,
  detail: string
): LabOrganizationMetric {
  return {
    key,
    label,
    detail,
    availableCount: 0,
    inUseCount: 0,
    attentionCount: 0,
    archivedCount: 0,
    total: 0
  };
}

function countLabOrganizationBoard(metric: LabOrganizationMetric, board: Board): void {
  metric.total += 1;

  if (board.status === "available") {
    metric.availableCount += 1;
    return;
  }

  if (board.status === "in_use") {
    metric.inUseCount += 1;
    return;
  }

  if (board.status === "archived") {
    metric.archivedCount += 1;
    return;
  }

  metric.attentionCount += 1;
}

function chipFamilyColor(index: number): string {
  return chipFamilyPalette[index % chipFamilyPalette.length];
}

function isOtaReady(board: Board): boolean {
  const partitions = board.partitions ?? [];
  const hasOtaData = partitions.some(
    (partition) => partition.type === 0x01 && partition.subtype === 0x00
  );
  const otaAppSlots = partitions.filter(
    (partition) =>
      partition.type === 0x00 &&
      partition.subtype >= 0x10 &&
      partition.subtype <= 0x1f
  ).length;

  return hasOtaData && otaAppSlots >= 2;
}

function getOpenFlashBytes(board: Board, partitionedBytes: number): number {
  const totalFlashBytes = getTotalFlashBytes(board);
  if (totalFlashBytes <= 0) {
    return 0;
  }

  const reservedBytes = Math.min(
    totalFlashBytes,
    getPartitionTableOffset(board) + PARTITION_TABLE_REGION_SIZE
  );
  return Math.max(totalFlashBytes - reservedBytes - partitionedBytes, 0);
}

function getTotalFlashBytes(board: Board): number {
  if (board.flashSizeBytes !== null && board.flashSizeBytes > 0) {
    return board.flashSizeBytes;
  }

  return (board.partitions ?? []).reduce(
    (max, partition) => Math.max(max, partition.offset + partition.sizeBytes),
    0
  );
}

function getPartitionTableOffset(board: Board): number {
  return board.partitionTableOffset !== null && board.partitionTableOffset > 0
    ? board.partitionTableOffset
    : DEFAULT_PARTITION_TABLE_OFFSET;
}

function getFilesystemMetric(partition: BoardPartition): FilesystemMetric | null {
  const key = getFilesystemKey(partition);

  if (!key) {
    return null;
  }

  return {
    key,
    label:
      key === "fatfs" ? "FATFS" : key === "littlefs" ? "LittleFS" : "SPIFFS",
    bytes: 0,
    color: filesystemPalette[key]
  };
}

function getFilesystemKey(
  partition: BoardPartition
): keyof typeof filesystemPalette | null {
  if (partition.filesystem) {
    return partition.filesystem;
  }

  if (partition.type !== 0x01) {
    return null;
  }

  if (partition.subtype === 0x81) return "fatfs";
  if (partition.subtype === 0x82) return "spiffs";
  if (partition.subtype === 0x83) return "littlefs";

  return null;
}

function formatBoardCount(count: number): string {
  return `${count} board${count === 1 ? "" : "s"}`;
}

function getChartTooltipBase(): {
  backgroundColor: string;
  bodyColor: string;
  borderColor: string;
  titleColor: string;
} {
  return {
    backgroundColor: getCssVariable("--vault-tooltip-bg", "#14342d"),
    bodyColor: getCssVariable("--vault-tooltip-text", "#f4fff9"),
    borderColor: getCssVariable(
      "--vault-tooltip-border",
      "rgba(45, 212, 191, 0.35)"
    ),
    titleColor: getCssVariable("--vault-tooltip-text", "#f4fff9")
  };
}

function getChartBorderColor(): string {
  return getCssVariable("--v-theme-background", "7, 18, 17")
    .split(",")
    .length === 3
    ? `rgb(${getCssVariable("--v-theme-background", "7, 18, 17")})`
    : "rgba(7, 18, 17, 0.94)";
}

function getChartGridColor(): string {
  return getCssVariable("--vault-soft-border", "rgba(148, 163, 184, 0.18)");
}

function getChartMutedColor(): string {
  return getCssVariable("--vault-muted", "#94a3b8");
}

function getCssVariable(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
</script>

<template>
  <section class="page-shell dashboard-shell">
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-alert
      v-if="isDevelopmentMode"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      Development mode uses its own app data profile. Boards, projects, and
      appearance settings are separate from the release app.
    </v-alert>

    <div class="dashboard-insights">
      <div class="insight-card insight-card--boards">
        <v-icon icon="mdi-developer-board" />
        <div>
          <div class="insight-value">{{ totalBoards }}</div>
          <div class="insight-label">Boards tracked</div>
        </div>
      </div>
      <div class="insight-card insight-card--projects">
        <v-icon icon="mdi-folder-multiple-outline" />
        <div>
          <div class="insight-value">{{ projects.length }}</div>
          <div class="insight-label">Projects</div>
        </div>
      </div>
      <div class="insight-card insight-card--available">
        <v-icon icon="mdi-check-circle-outline" />
        <div>
          <div class="insight-value">{{ availableBoards }}</div>
          <div class="insight-label">Available boards</div>
        </div>
      </div>
      <div class="insight-card insight-card--attention">
        <v-icon icon="mdi-alert-outline" />
        <div>
          <div class="insight-value">{{ boardsNeedingAttention }}</div>
          <div class="insight-label">Boards need attention</div>
        </div>
      </div>
    </div>

    <div class="dashboard-main-grid">
      <v-card class="panel-card dashboard-panel chip-family-panel" flat>
          <v-card-title class="text-subtitle-1 font-weight-bold chip-family-title">
            <v-icon class="mr-2" color="primary" icon="mdi-chart-donut" />
            Boards by chip family
          </v-card-title>
          <v-divider />
          <div v-if="chipFamilyMetrics.length" class="chip-family-chart-card">
            <div class="chip-family-chart-wrap">
              <canvas ref="chipFamilyChartCanvas" aria-label="Boards by chip family chart" />
              <div class="chip-family-chart-center">
                <strong>{{ totalBoards }}</strong>
                <span>Total</span>
              </div>
            </div>

            <div class="chip-family-chart-content">
              <div class="chip-family-summary-row">
                <div>
                  <div class="metric-label">Chip mix</div>
                  <div class="chip-family-summary">
                    {{ chipFamilyCount }} famil{{ chipFamilyCount === 1 ? "y" : "ies" }}
                  </div>
                </div>
                <v-chip color="primary" size="small" variant="tonal">
                  {{ dominantChipFamily }}
                </v-chip>
              </div>

              <div class="chip-family-legend">
                <div
                  v-for="(chipFamily, index) in chipFamilyChartMetrics"
                  :key="chipFamily.label"
                  class="chip-family-legend-item"
                >
                  <span
                    class="chip-family-dot"
                    :style="{ backgroundColor: chipFamilyColor(index) }"
                  />
                  <div class="chip-family-legend-copy">
                    <span>{{ chipFamily.label }}</span>
                    <small>{{ chipFamily.count }} board{{ chipFamily.count === 1 ? "" : "s" }}</small>
                  </div>
                  <strong>{{ chipFamily.count }}</strong>
                </div>
              </div>
            </div>

            <div class="chip-family-insights-grid">
              <div class="chip-insight-panel">
                <div class="chip-insight-heading">
                  <div>
                    <div class="metric-label">Scan freshness</div>
                    <strong>{{ latestScanDate }}</strong>
                  </div>
                  <v-icon color="primary" icon="mdi-radar" />
                </div>
                <div class="scan-freshness-list">
                  <div
                    v-for="metric in scanFreshnessMetrics"
                    :key="metric.key"
                    class="scan-freshness-row"
                  >
                    <div class="scan-freshness-copy">
                      <span>{{ metric.label }}</span>
                      <small>{{ metric.detail }}</small>
                    </div>
                    <div class="scan-freshness-meter">
                      <span
                        :style="{
                          width: `${metric.percent}%`,
                          backgroundColor: metric.color
                        }"
                      />
                    </div>
                    <strong>{{ metric.count }}</strong>
                  </div>
                </div>
              </div>

              <div class="chip-insight-panel">
                <div class="chip-insight-heading">
                  <div>
                    <div class="metric-label">Capability snapshot</div>
                    <strong>{{ psramEquippedBoards }} PSRAM-ready</strong>
                  </div>
                  <v-icon color="info" icon="mdi-memory" />
                </div>
                <div class="capability-grid">
                  <div>
                    <span>Average flash</span>
                    <strong>{{ formatBytes(averageFlashBytes) }}</strong>
                  </div>
                  <div>
                    <span>Largest flash</span>
                    <strong>{{ formatBytes(largestFlashBoard?.flashSizeBytes ?? 0) }}</strong>
                  </div>
                  <div>
                    <span>Known flash</span>
                    <strong>{{ boardsWithKnownFlash }}/{{ totalBoards }}</strong>
                  </div>
                  <div>
                    <span>Top capacity</span>
                    <strong>{{ largestFlashBoard?.chipModel ?? "Not set" }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-state ma-4">
            <v-icon icon="mdi-chip" size="34" color="primary" />
            <div class="text-subtitle-1 font-weight-bold mt-2">No chip data yet.</div>
            <div class="text-body-2 muted mt-1">
              Scan boards to populate chip family counts.
            </div>
          </div>
      </v-card>

      <v-card class="panel-card dashboard-panel partition-insights-panel" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold partition-insights-title">
          <v-icon class="mr-2" color="primary" icon="mdi-memory" />
          Partition insights
        </v-card-title>
        <v-divider />
        <div
          v-if="partitionInsights.boardsWithPartitions"
          class="partition-insights-grid"
        >
          <div class="partition-flash-summary">
            <div class="partition-flash-chart-wrap">
              <canvas
                ref="partitionFlashChartCanvas"
                aria-label="Partitioned and open flash chart"
              />
              <div class="partition-flash-chart-center">
                <strong>{{ partitionedFlashPercent }}%</strong>
                <span>partitioned</span>
              </div>
            </div>
            <div class="partition-flash-copy">
              <div class="metric-label">Flash layout</div>
              <div class="partition-flash-headline">
                {{ formatBytes(partitionInsights.partitionedBytes) }} mapped
              </div>
              <div class="partition-flash-legend">
                <span><i class="legend-dot legend-dot--primary" />Partitioned</span>
                <span><i class="legend-dot legend-dot--amber" />Open flash</span>
              </div>
            </div>
          </div>

          <div class="partition-kpi-grid">
            <div class="partition-kpi">
              <v-icon color="primary" icon="mdi-radar" />
              <div>
                <strong>{{ formatBoardCount(partitionInsights.boardsWithPartitions) }}</strong>
                <span>with partition maps</span>
              </div>
            </div>
            <div class="partition-kpi">
              <v-icon color="success" icon="mdi-update" />
              <div>
                <strong>{{ otaReadyPercent }}%</strong>
                <span>OTA-ready layouts</span>
              </div>
            </div>
            <div class="partition-kpi">
              <v-icon color="info" icon="mdi-table-row" />
              <div>
                <strong>{{ averagePartitionsPerBoard }}</strong>
                <span>avg partitions per board</span>
              </div>
            </div>
            <div class="partition-kpi">
              <v-icon color="warning" icon="mdi-alert-circle-outline" />
              <div>
                <strong>{{ partitionInsights.failedBoards }}</strong>
                <span>partition reads failed</span>
              </div>
            </div>
          </div>

          <div class="open-flash-panel">
            <div class="partition-section-heading">
              <div>
                <div class="metric-label">Open flash opportunities</div>
                <strong>{{ formatBytes(partitionInsights.openBytes) }} available</strong>
              </div>
              <v-chip color="warning" size="small" variant="tonal">
                Top {{ partitionInsights.topOpenFlashBoards.length }}
              </v-chip>
            </div>
            <div
              v-if="partitionInsights.topOpenFlashBoards.length"
              class="open-flash-chart-wrap"
            >
              <div
                class="open-flash-board-axis"
                :style="{
                  gridTemplateRows: `repeat(${partitionInsights.topOpenFlashBoards.length}, minmax(0, 1fr))`
                }"
              >
                <div
                  v-for="metric in partitionInsights.topOpenFlashBoards"
                  :key="metric.board.id"
                  class="open-flash-board-row"
                >
                  <span :title="metric.board.name">{{ metric.board.name }}</span>
                  <v-tooltip :text="`Open ${metric.board.name}`">
                    <template #activator="{ props: tooltipProps }">
                      <v-btn
                        v-bind="tooltipProps"
                        class="open-flash-board-action"
                        color="primary"
                        icon="mdi-open-in-new"
                        size="x-small"
                        variant="text"
                        :aria-label="`Open ${metric.board.name}`"
                        @click.stop="emit('open-board', metric.board.id)"
                      />
                    </template>
                  </v-tooltip>
                </div>
              </div>
              <div class="open-flash-chart-canvas">
                <canvas
                  ref="openFlashChartCanvas"
                  aria-label="Boards with the most open flash"
                />
              </div>
            </div>
            <div v-else class="partition-mini-empty">
              No open flash detected in recorded partition maps.
            </div>
          </div>

          <div class="filesystem-panel">
            <div class="partition-section-heading">
              <div>
                <div class="metric-label">Filesystem footprint</div>
                <strong>
                  {{ partitionInsights.filesystemMetrics.length || "No" }}
                  filesystem{{ partitionInsights.filesystemMetrics.length === 1 ? "" : "s" }}
                </strong>
              </div>
            </div>
            <div
              v-if="partitionInsights.filesystemMetrics.length"
              class="filesystem-metrics"
            >
              <div
                v-for="metric in partitionInsights.filesystemMetrics"
                :key="metric.key"
                class="filesystem-metric"
              >
                <span
                  class="filesystem-dot"
                  :style="{ backgroundColor: metric.color }"
                />
                <span>{{ metric.label }}</span>
                <strong>{{ formatBytes(metric.bytes) }}</strong>
              </div>
            </div>
            <div v-else class="partition-mini-empty">
              No SPIFFS, LittleFS, or FATFS partitions recorded yet.
            </div>
          </div>
        </div>

        <div v-else class="empty-state ma-4">
          <v-icon icon="mdi-table-search" size="34" color="primary" />
          <div class="text-subtitle-1 font-weight-bold mt-2">
            No partition maps yet.
          </div>
          <div class="text-body-2 muted mt-1">
            Scan boards to unlock flash layout, OTA, and filesystem insights.
          </div>
        </div>
      </v-card>
    </div>

    <v-card class="panel-card dashboard-panel project-insights-panel" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold project-insights-title">
        <v-icon class="mr-2" color="primary" icon="mdi-folder-chart-outline" />
        Project insights
      </v-card-title>
      <v-divider />

      <div v-if="projects.length" class="project-insights-grid">
        <div class="project-status-visual">
          <div class="project-status-chart-wrap">
            <canvas
              ref="projectStatusChartCanvas"
              aria-label="Project status distribution chart"
            />
            <div class="project-status-chart-center">
              <strong>{{ projects.length }}</strong>
              <span>projects</span>
            </div>
          </div>

          <div class="project-status-copy">
            <div class="metric-label">Status mix</div>
            <div class="project-status-headline">
              {{ activeProjects }} active /
              {{ projectsNeedingAttention }} needing attention
            </div>
            <div class="project-status-legend">
              <v-chip
                v-for="metric in projectStatusMetrics"
                :key="metric.status"
                :color="PROJECT_STATUS_COLORS[metric.status]"
                :prepend-icon="metric.status === 'needs_repair' ? 'mdi-wrench-outline' : 'mdi-folder-outline'"
                size="small"
                variant="tonal"
              >
                {{ metric.count }} {{ metric.label }}
              </v-chip>
            </div>
          </div>
        </div>

        <div class="project-kpi-grid">
          <div class="project-kpi">
            <v-icon color="success" icon="mdi-folder-check-outline" />
            <div>
              <strong>{{ projectCoveragePercent }}%</strong>
              <span>with assigned boards</span>
            </div>
          </div>
          <div class="project-kpi">
            <v-icon color="info" icon="mdi-format-list-checks" />
            <div>
              <strong>{{ openProjectChecklistItems }}</strong>
              <span>open checklist tasks</span>
            </div>
          </div>
          <div class="project-kpi">
            <v-icon color="warning" icon="mdi-alert-outline" />
            <div>
              <strong>{{ projectsNeedingAttention }}</strong>
              <span>projects to review</span>
            </div>
          </div>
        </div>

        <div class="project-focus-list">
          <div class="project-focus-heading">
            <div>
              <div class="metric-label">Project focus</div>
              <strong>Boards, tasks, and repair pressure</strong>
            </div>
          </div>

          <div class="project-focus-rows">
            <button
              v-for="metric in projectInsightMetrics"
              :key="metric.project.id"
              class="project-focus-row"
              type="button"
              @click="emit('open-project', metric.project.id)"
            >
              <div class="project-focus-main">
                <div class="project-focus-name">
                  {{ metric.project.name }}
                </div>
                <div class="project-focus-meta">
                  {{ metric.assignedBoards }} board{{ metric.assignedBoards === 1 ? "" : "s" }} /
                  {{ metric.openChecklistItems }} open task{{ metric.openChecklistItems === 1 ? "" : "s" }}
                </div>
              </div>
              <div class="project-focus-progress">
                <span
                  :style="{ width: `${projectChecklistPercent(metric)}%` }"
                />
              </div>
              <v-chip
                :color="projectInsightColor(metric)"
                size="x-small"
                variant="tonal"
              >
                {{ projectInsightLabel(metric) }}
              </v-chip>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state ma-4">
        <v-icon icon="mdi-folder-plus-outline" size="34" color="primary" />
        <div class="text-subtitle-1 font-weight-bold mt-2">No project insights yet.</div>
        <div class="text-body-2 muted mt-1">
          Create projects and assign boards to see status, task, and repair pressure.
        </div>
      </div>
    </v-card>

    <div class="dashboard-snapshot">
      <div class="snapshot-panel snapshot-panel--memory">
        <div class="snapshot-panel-head">
          <div class="snapshot-panel-summary">
            <div class="metric-label">Known memory</div>
            <strong>{{ formatBytes(totalKnownMemoryBytes) }}</strong>
            <span>Recorded capacity</span>
          </div>
          <v-icon color="primary" icon="mdi-memory" />
        </div>

        <div v-if="hasKnownMemory" class="memory-inventory-chart">
          <div
            class="memory-inventory-axis"
            :style="{
              gridTemplateRows: `repeat(${memoryInventoryMetrics.length}, minmax(0, 1fr))`
            }"
          >
            <div
              v-for="metric in memoryInventoryMetrics"
              :key="metric.key"
              class="memory-inventory-axis-row"
            >
              <span>{{ metric.label }}</span>
              <small>{{ formatRecordedCount(metric.knownBoards) }}</small>
            </div>
          </div>
          <div class="memory-inventory-canvas">
            <canvas
              ref="knownMemoryChartCanvas"
              aria-label="Known flash and PSRAM memory chart"
            />
          </div>
        </div>

        <div v-else class="snapshot-chart-empty">
          Scan boards to record flash and PSRAM capacity.
        </div>

        <div class="memory-inventory-totals">
          <span>
            <i class="memory-dot memory-dot--flash" />
            Flash {{ formatBytes(totalFlashBytes) }}
          </span>
          <span>
            <i class="memory-dot memory-dot--psram" />
            PSRAM {{ formatBytes(totalPsramBytes) }}
          </span>
        </div>
      </div>
      <div class="snapshot-panel snapshot-panel--state">
        <div class="snapshot-panel-head">
          <div class="snapshot-panel-summary">
            <div class="metric-label">Board state</div>
            <strong>{{ readyBoardPercent }}% ready</strong>
            <span>{{ boardsNeedingAttention }} need attention</span>
          </div>
          <v-icon color="success" icon="mdi-pulse" />
        </div>

        <div v-if="totalBoards" class="board-state-chart">
          <canvas
            ref="boardStateChartCanvas"
            aria-label="Board status distribution chart"
          />
        </div>

        <div v-else class="snapshot-chart-empty">
          Add boards to track inventory state.
        </div>

        <div class="status-pills">
          <v-chip
            v-for="metric in visibleBoardStateMetrics"
            :key="metric.status"
            class="status-pill"
            :color="BOARD_STATUS_COLORS[metric.status]"
            :prepend-icon="BOARD_STATUS_ICONS[metric.status]"
            size="small"
            variant="tonal"
          >
            {{ metric.count }} {{ metric.displayLabel }}
          </v-chip>
        </div>
      </div>
      <div class="snapshot-panel snapshot-panel--lab">
        <div class="lab-organization-head">
          <div class="lab-organization-summary">
            <div class="metric-label">Lab organization</div>
            <strong>{{ organizedBoardPercent }}% assigned</strong>
            <span>
              {{ projectGroupsInUse }} project group{{ projectGroupsInUse === 1 ? "" : "s" }} in use
            </span>
          </div>
          <v-chip
            :color="unassignedBoards ? 'warning' : 'success'"
            prepend-icon="mdi-folder-account-outline"
            size="small"
            variant="tonal"
          >
            {{ unassignedBoards }} unassigned
          </v-chip>
        </div>

        <div v-if="labOrganizationMetrics.length" class="lab-organization-chart">
          <div
            class="lab-organization-axis"
            :style="{
              gridTemplateRows: `repeat(${labOrganizationMetrics.length}, minmax(0, 1fr))`
            }"
          >
            <div
              v-for="metric in labOrganizationMetrics"
              :key="metric.key"
              class="lab-organization-axis-row"
            >
              <span :title="metric.label">{{ metric.label }}</span>
              <small>
                {{ metric.total }} board{{ metric.total === 1 ? "" : "s" }} /
                {{ metric.detail }}
              </small>
            </div>
          </div>
          <div class="lab-organization-canvas">
            <canvas
              ref="labOrganizationChartCanvas"
              aria-label="Project assignment and board status chart"
            />
          </div>
        </div>

        <div v-else class="lab-organization-empty">
          Assign boards to projects to map bench load and unassigned hardware.
        </div>

        <div v-if="labOrganizationMetrics.length" class="lab-organization-legend">
          <span><i class="lab-legend-dot lab-legend-dot--available" />Available</span>
          <span><i class="lab-legend-dot lab-legend-dot--in-use" />In use</span>
          <span><i class="lab-legend-dot lab-legend-dot--attention" />Attention</span>
          <span><i class="lab-legend-dot lab-legend-dot--archived" />Archived</span>
        </div>
      </div>
    </div>

    <v-card class="panel-card dashboard-panel recent-activity-panel" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-history" />
          Recent activity
        </v-card-title>
        <v-divider />
        <v-list v-if="recentActivity.length" lines="two" class="activity-list">
          <v-list-item
            v-for="(activity, index) in recentActivity"
            :key="`${activity.kind}-${activity.board.id}-${index}`"
            :title="activity.board.name"
            :subtitle="formatDate(activity.date)"
          >
            <template #prepend>
              <div class="activity-event-icon">
                <v-icon :color="activity.color" :icon="activity.icon" size="22" />
              </div>
            </template>
            <template #title>
              <div class="activity-title-row">
                <span>{{ activity.board.name }}</span>
                <v-chip :color="activity.color" size="x-small" variant="tonal">
                  {{ activity.label }}
                </v-chip>
              </div>
            </template>
            <template #append>
              <v-chip
                class="status-chip"
                :color="BOARD_STATUS_COLORS[activity.board.status]"
                :prepend-icon="BOARD_STATUS_ICONS[activity.board.status]"
                size="small"
                variant="tonal"
              >
                {{ BOARD_STATUS_LABELS[activity.board.status] }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="empty-state ma-4">
          <v-icon icon="mdi-developer-board" size="34" color="primary" />
          <div class="text-subtitle-1 font-weight-bold mt-2">No boards yet.</div>
          <div class="text-body-2 muted mt-1">
            Add a board manually to start building your inventory.
          </div>
          <v-btn
            class="mt-4"
            color="primary"
            prepend-icon="mdi-plus"
            @click="emit('open-boards')"
          >
            Add board
          </v-btn>
        </div>
    </v-card>
  </section>
</template>

<style scoped>
.dashboard-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-insights {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.insight-card {
  --insight-rgb: var(--v-theme-primary);
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  padding: 16px;
  background:
    linear-gradient(135deg, rgba(var(--insight-rgb), 0.12), rgba(var(--v-theme-surface), 0.84)),
    rgb(var(--v-theme-surface));
  box-shadow: var(--vault-card-shadow);
}

.insight-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: rgba(var(--insight-rgb), 0.78);
  content: "";
}

.insight-card :deep(.v-icon) {
  display: grid;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(var(--insight-rgb), 0.24);
  border-radius: 8px;
  background: rgba(var(--insight-rgb), 0.12);
  color: rgb(var(--insight-rgb));
}

.insight-card--boards {
  --insight-rgb: var(--v-theme-primary);
}

.insight-card--projects {
  --insight-rgb: var(--v-theme-accent);
}

.insight-card--available {
  --insight-rgb: var(--v-theme-success);
}

.insight-card--attention {
  --insight-rgb: var(--v-theme-warning);
}

.insight-value {
  color: var(--vault-text);
  font-size: 1.75rem;
  font-weight: 850;
  line-height: 1;
}

.insight-label {
  margin-top: 5px;
  color: var(--vault-muted);
  font-size: 0.8rem;
  font-weight: 750;
  text-transform: uppercase;
}

.project-insights-panel {
  overflow: hidden;
}

.project-insights-title {
  min-height: 52px;
  padding: 12px 16px !important;
  background:
    radial-gradient(circle at 10% 22%, rgba(var(--v-theme-primary), 0.16), transparent 32%),
    rgba(var(--v-theme-surface), 0.38);
}

.project-insights-grid {
  display: grid;
  grid-template-columns: minmax(520px, 0.95fr) minmax(420px, 1.05fr);
  gap: 12px;
  align-items: start;
  padding: 12px 16px 16px;
  background:
    radial-gradient(circle at 12% 32%, rgba(var(--v-theme-primary), 0.1), transparent 28%),
    radial-gradient(circle at 78% 16%, rgba(var(--v-theme-accent), 0.08), transparent 28%),
    linear-gradient(135deg, rgba(var(--v-theme-surface), 0.78), rgba(var(--v-theme-background), 0.18));
}

.project-status-visual,
.project-kpi,
.project-focus-list {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.48);
}

.project-status-visual {
  display: grid;
  grid-template-columns: minmax(118px, 150px) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  grid-column: 1;
  padding: 12px;
}

.project-status-chart-wrap {
  position: relative;
  width: min(142px, 38vw);
  aspect-ratio: 1;
  justify-self: center;
}

.project-status-chart-wrap canvas {
  position: relative;
  z-index: 2;
  width: 100% !important;
  height: 100% !important;
}

.project-status-chart-wrap::before {
  position: absolute;
  inset: 10%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.12), transparent 62%);
  box-shadow: 0 0 42px rgba(var(--v-theme-primary), 0.16);
  content: "";
}

.project-status-chart-center {
  position: absolute;
  z-index: 1;
  inset: 30%;
  display: grid;
  place-items: center;
  align-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 999px;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface), 0.96), rgba(var(--v-theme-background), 0.78));
  box-shadow: inset 0 0 24px rgba(var(--v-theme-primary), 0.1);
  pointer-events: none;
}

.project-status-chart-center strong {
  color: var(--vault-text);
  font-size: 1.08rem;
  font-weight: 850;
  line-height: 1;
}

.project-status-chart-center span {
  margin-top: 4px;
  color: var(--vault-muted);
  font-size: 0.58rem;
  font-weight: 800;
  text-transform: uppercase;
}

.project-status-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.project-status-headline {
  color: var(--vault-text);
  font-size: 1rem;
  font-weight: 850;
  line-height: 1.22;
}

.project-status-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.project-kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-column: 1;
  gap: 8px;
}

.project-kpi {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 10px;
}

.project-kpi :deep(.v-icon) {
  flex: 0 0 auto;
}

.project-kpi div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.project-kpi strong {
  color: var(--vault-text);
  font-size: 1.02rem;
  font-weight: 850;
}

.project-kpi span {
  color: var(--vault-muted);
  font-size: 0.66rem;
  font-weight: 750;
  text-transform: uppercase;
}

.project-focus-list {
  display: grid;
  grid-column: 2;
  grid-row: 1 / span 2;
  gap: 8px;
  padding: 12px;
  min-width: 0;
}

.project-focus-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.project-focus-heading strong {
  display: block;
  margin-top: 3px;
  color: var(--vault-text);
  font-size: 0.92rem;
}

.project-focus-rows {
  display: grid;
  gap: 6px;
}

.project-focus-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(86px, 0.25fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(var(--v-theme-surface), 0.4);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
}

.project-focus-row:hover,
.project-focus-row:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.34);
  background: rgba(var(--v-theme-primary), 0.08);
  outline: none;
}

.project-focus-main {
  min-width: 0;
}

.project-focus-name,
.project-focus-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-focus-name {
  color: var(--vault-text);
  font-size: 0.9rem;
  font-weight: 800;
}

.project-focus-meta {
  margin-top: 2px;
  color: var(--vault-muted);
  font-size: 0.72rem;
}

.project-focus-progress {
  overflow: hidden;
  height: 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface-variant), 0.78);
}

.project-focus-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-success)));
}

.dashboard-snapshot {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 12px;
}

.snapshot-panel {
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  padding: 18px;
  background: rgba(var(--v-theme-surface), 0.78);
}

.snapshot-panel--lab {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.snapshot-panel--memory,
.snapshot-panel--state {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.snapshot-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.snapshot-panel-head :deep(.v-icon) {
  flex: 0 0 auto;
}

.snapshot-panel-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.snapshot-panel-summary strong {
  color: var(--vault-text);
  font-size: 1.22rem;
  font-weight: 850;
  line-height: 1.15;
}

.snapshot-panel-summary span {
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-values {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.snapshot-values div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.snapshot-values .memory-row {
  align-items: flex-start;
}

.memory-row > div {
  display: grid;
  gap: 4px;
}

.snapshot-values strong {
  min-width: 0;
  color: var(--vault-text);
  font-size: 1.22rem;
  overflow-wrap: anywhere;
}

.memory-type {
  color: var(--vault-muted);
  font-size: 0.82rem;
  font-weight: 750;
  text-transform: uppercase;
}

.snapshot-values span {
  color: var(--vault-muted);
  font-size: 0.85rem;
  text-align: right;
}

.memory-inventory-chart {
  display: grid;
  grid-template-columns: minmax(88px, 0.28fr) minmax(0, 1fr);
  gap: 10px;
  height: 126px;
  min-width: 0;
}

.memory-inventory-axis {
  display: grid;
  min-width: 0;
  padding: 7px 0 25px;
}

.memory-inventory-axis-row {
  display: grid;
  align-content: center;
  min-width: 0;
}

.memory-inventory-axis-row span {
  overflow: hidden;
  color: var(--vault-text);
  font-size: 0.8rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-inventory-axis-row small {
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-inventory-canvas,
.board-state-chart {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.memory-inventory-canvas canvas,
.board-state-chart canvas {
  width: 100% !important;
  height: 100% !important;
}

.memory-inventory-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.memory-inventory-totals span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vault-muted);
  font-size: 0.75rem;
  font-weight: 750;
}

.memory-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.memory-dot--flash {
  background: #2dd4bf;
}

.memory-dot--psram {
  background: #a78bfa;
}

.board-state-chart {
  height: 92px;
}

.snapshot-chart-empty {
  border: 1px dashed var(--vault-border);
  border-radius: 8px;
  padding: 14px;
  color: var(--vault-muted);
  font-size: 0.9rem;
}

.lab-organization-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.lab-organization-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.lab-organization-summary strong {
  color: var(--vault-text);
  font-size: 1.22rem;
  font-weight: 850;
  line-height: 1.15;
}

.lab-organization-summary span {
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lab-organization-chart {
  display: grid;
  grid-template-columns: minmax(108px, 0.43fr) minmax(0, 1fr);
  gap: 10px;
  height: 154px;
  min-width: 0;
}

.lab-organization-axis {
  display: grid;
  min-width: 0;
  padding: 6px 0 24px;
}

.lab-organization-axis-row {
  display: grid;
  align-content: center;
  min-width: 0;
  min-height: 0;
}

.lab-organization-axis-row span {
  overflow: hidden;
  color: var(--vault-text);
  font-size: 0.8rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lab-organization-axis-row small {
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lab-organization-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.lab-organization-canvas canvas {
  width: 100% !important;
  height: 100% !important;
}

.lab-organization-empty {
  border: 1px dashed var(--vault-border);
  border-radius: 8px;
  padding: 14px;
  color: var(--vault-muted);
  font-size: 0.9rem;
}

.lab-organization-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.lab-organization-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vault-muted);
  font-size: 0.73rem;
  font-weight: 750;
}

.lab-legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.lab-legend-dot--available {
  background: #22c55e;
}

.lab-legend-dot--in-use {
  background: #38bdf8;
}

.lab-legend-dot--attention {
  background: #f59e0b;
}

.lab-legend-dot--archived {
  background: #94a3b8;
}

.status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 0;
}

.status-pill {
  max-width: 100%;
}

.dashboard-main-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.85fr) minmax(520px, 1.15fr);
  gap: 16px;
  align-items: stretch;
}

.dashboard-panel {
  min-height: 180px;
}

.recent-activity-panel {
  min-height: 0;
}

.chip-family-panel {
  overflow: hidden;
}

.chip-family-title {
  background:
    radial-gradient(circle at 12% 12%, rgba(var(--v-theme-primary), 0.16), transparent 34%),
    rgba(var(--v-theme-surface), 0.38);
}

.chip-family-chart-card {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding: 20px;
  background:
    radial-gradient(circle at 28% 42%, rgba(var(--v-theme-primary), 0.16), transparent 34%),
    radial-gradient(circle at 84% 12%, rgba(var(--v-theme-accent), 0.1), transparent 28%),
    linear-gradient(135deg, rgba(var(--v-theme-surface), 0.76), rgba(var(--v-theme-background), 0.18));
}

.chip-family-chart-wrap {
  position: relative;
  width: min(210px, 52vw);
  aspect-ratio: 1;
  justify-self: center;
}

.chip-family-chart-wrap canvas {
  position: relative;
  z-index: 2;
  width: 100% !important;
  height: 100% !important;
}

.chip-family-chart-wrap::before {
  position: absolute;
  inset: 10%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.12), transparent 62%);
  box-shadow: 0 0 42px rgba(var(--v-theme-primary), 0.16);
  content: "";
}

.chip-family-chart-center {
  position: absolute;
  z-index: 1;
  inset: 29%;
  display: grid;
  place-items: center;
  align-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 999px;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface), 0.96), rgba(var(--v-theme-background), 0.78));
  box-shadow: inset 0 0 24px rgba(var(--v-theme-primary), 0.1);
  pointer-events: none;
}

.chip-family-chart-center strong {
  color: var(--vault-text);
  font-size: 1.55rem;
  font-weight: 850;
  line-height: 1;
}

.chip-family-chart-center span {
  margin-top: 4px;
  color: var(--vault-muted);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.chip-family-chart-content {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.chip-family-summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chip-family-summary {
  margin-top: 4px;
  color: var(--vault-text);
  font-size: 1.1rem;
  font-weight: 800;
}

.chip-family-legend {
  display: grid;
  gap: 9px;
}

.chip-family-legend-item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(var(--v-theme-surface), 0.4);
}

.chip-family-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.08);
}

.chip-family-legend-copy {
  display: grid;
  min-width: 0;
}

.chip-family-legend-copy span {
  min-width: 0;
  overflow: hidden;
  color: var(--vault-text);
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-family-legend-copy small {
  color: var(--vault-muted);
  font-size: 0.75rem;
}

.chip-family-legend-item strong {
  color: var(--vault-text);
  font-weight: 850;
}

.chip-family-insights-grid {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.chip-insight-panel {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 16px;
  background:
    radial-gradient(circle at 12% 12%, rgba(var(--v-theme-primary), 0.1), transparent 36%),
    rgba(var(--v-theme-surface), 0.42);
}

.chip-insight-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.chip-insight-heading strong {
  display: block;
  margin-top: 4px;
  color: var(--vault-text);
  font-size: 1.05rem;
  font-weight: 850;
}

.scan-freshness-list {
  display: grid;
  gap: 10px;
}

.scan-freshness-row {
  display: grid;
  grid-template-columns: minmax(100px, 0.8fr) minmax(80px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.scan-freshness-copy {
  display: grid;
  min-width: 0;
}

.scan-freshness-copy span {
  overflow: hidden;
  color: var(--vault-text);
  font-size: 0.84rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scan-freshness-copy small {
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scan-freshness-meter {
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.scan-freshness-meter span {
  display: block;
  min-width: 3px;
  height: 100%;
  border-radius: inherit;
}

.scan-freshness-row strong {
  color: var(--vault-text);
  font-weight: 850;
  text-align: right;
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.capability-grid > div {
  min-width: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  padding: 10px;
  background: rgba(var(--v-theme-surface), 0.38);
}

.capability-grid span {
  display: block;
  overflow: hidden;
  color: var(--vault-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.capability-grid strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--vault-text);
  font-size: 1rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-list :deep(.v-list-item) {
  min-height: 66px;
}

.activity-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.activity-title-row span {
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-event-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.32);
}

.partition-insights-panel {
  overflow: hidden;
}

.partition-insights-title {
  background:
    radial-gradient(circle at 8% 20%, rgba(var(--v-theme-primary), 0.15), transparent 32%),
    rgba(var(--v-theme-surface), 0.38);
}

.partition-insights-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1.05fr) minmax(300px, 0.95fr);
  gap: 16px;
  padding: 20px;
  background:
    radial-gradient(circle at 12% 32%, rgba(var(--v-theme-primary), 0.12), transparent 28%),
    radial-gradient(circle at 76% 18%, rgba(var(--v-theme-warning), 0.08), transparent 26%),
    linear-gradient(135deg, rgba(var(--v-theme-surface), 0.78), rgba(var(--v-theme-background), 0.18));
}

.partition-flash-summary,
.open-flash-panel,
.filesystem-panel {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.44);
}

.partition-flash-summary {
  display: grid;
  grid-template-columns: minmax(150px, 210px) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding: 18px;
}

.partition-flash-chart-wrap {
  position: relative;
  width: min(200px, 48vw);
  aspect-ratio: 1;
  justify-self: center;
}

.partition-flash-chart-wrap canvas,
.open-flash-chart-wrap canvas {
  position: relative;
  z-index: 2;
  width: 100% !important;
  height: 100% !important;
}

.partition-flash-chart-wrap::before {
  position: absolute;
  inset: 10%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.12), transparent 62%);
  box-shadow: 0 0 42px rgba(var(--v-theme-primary), 0.16);
  content: "";
}

.partition-flash-chart-center {
  position: absolute;
  z-index: 1;
  inset: 30%;
  display: grid;
  place-items: center;
  align-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 999px;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface), 0.96), rgba(var(--v-theme-background), 0.78));
  box-shadow: inset 0 0 24px rgba(var(--v-theme-primary), 0.1);
  pointer-events: none;
}

.partition-flash-chart-center strong {
  color: var(--vault-text);
  font-size: 1.4rem;
  font-weight: 850;
  line-height: 1;
}

.partition-flash-chart-center span {
  margin-top: 4px;
  color: var(--vault-muted);
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
}

.partition-flash-copy {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.partition-flash-headline {
  color: var(--vault-text);
  font-size: 1.25rem;
  font-weight: 850;
}

.partition-flash-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.partition-flash-legend span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--vault-muted);
  font-size: 0.82rem;
  font-weight: 750;
}

.legend-dot,
.filesystem-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.legend-dot--primary {
  background: #2dd4bf;
}

.legend-dot--amber {
  background: #f59e0b;
}

.partition-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.partition-kpi {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 84px;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 14px;
  background: rgba(var(--v-theme-surface), 0.44);
}

.partition-kpi :deep(.v-icon) {
  flex: 0 0 auto;
}

.partition-kpi div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.partition-kpi strong {
  color: var(--vault-text);
  font-size: 1.05rem;
  overflow-wrap: anywhere;
}

.partition-kpi span {
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 750;
  text-transform: uppercase;
}

.open-flash-panel,
.filesystem-panel {
  padding: 16px;
}

.partition-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.partition-section-heading strong {
  display: block;
  margin-top: 4px;
  color: var(--vault-text);
  font-size: 1.02rem;
}

.open-flash-chart-wrap {
  display: grid;
  grid-template-columns: minmax(126px, 0.42fr) minmax(0, 1fr);
  gap: 8px;
  height: 190px;
  margin-top: 12px;
}

.open-flash-board-axis {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: 5px 0 32px;
}

.open-flash-board-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  gap: 4px;
  align-items: center;
  min-height: 0;
}

.open-flash-board-row span {
  min-width: 0;
  overflow: hidden;
  color: var(--vault-text);
  font-size: 0.82rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.open-flash-board-action {
  justify-self: end;
}

.open-flash-chart-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.filesystem-metrics {
  display: grid;
  gap: 9px;
  margin-top: 14px;
}

.filesystem-metric {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  padding: 9px 10px;
  background: rgba(var(--v-theme-surface), 0.4);
}

.filesystem-metric span {
  color: var(--vault-text);
  font-weight: 750;
}

.filesystem-metric strong {
  color: var(--vault-text);
}

.partition-mini-empty {
  margin-top: 14px;
  border: 1px dashed var(--vault-border);
  border-radius: 8px;
  padding: 14px;
  color: var(--vault-muted);
  font-size: 0.9rem;
}

@media (max-width: 720px) {
  .chip-family-chart-card,
  .project-status-visual,
  .partition-flash-summary {
    grid-template-columns: 1fr;
  }

  .chip-family-insights-grid,
  .project-kpi-grid,
  .capability-grid {
    grid-template-columns: 1fr;
  }

  .chip-family-summary-row {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 1500px) and (min-width: 1181px) {
  .partition-insights-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .dashboard-main-grid,
  .project-insights-grid,
  .dashboard-snapshot,
  .partition-insights-grid {
    grid-template-columns: 1fr;
  }

  .project-focus-list {
    grid-column: auto;
    grid-row: auto;
  }

  .dashboard-insights {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .dashboard-insights {
    grid-template-columns: 1fr;
  }

  .snapshot-values div {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .snapshot-values span {
    text-align: left;
  }

  .lab-organization-chart {
    grid-template-columns: minmax(92px, 0.42fr) minmax(0, 1fr);
  }

  .lab-organization-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .partition-kpi-grid {
    grid-template-columns: 1fr;
  }

  .project-focus-row {
    grid-template-columns: 1fr;
  }

  .open-flash-chart-wrap {
    grid-template-columns: minmax(108px, 0.48fr) minmax(0, 1fr);
  }

  .open-flash-board-row span {
    font-size: 0.76rem;
  }
}
</style>
