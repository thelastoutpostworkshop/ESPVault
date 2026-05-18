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
import type { BoardPartition } from "../../shared/types/partition";
import { useBoardStore } from "../stores/boardStore";
import { useProjectStore } from "../stores/projectStore";
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

const boardStore = useBoardStore();
const projectStore = useProjectStore();
const { boards, dashboardStats, error } = storeToRefs(boardStore);
const { projects } = storeToRefs(projectStore);
const emit = defineEmits<{
  "open-boards": [];
}>();
const chipFamilyChartCanvas = ref<HTMLCanvasElement | null>(null);
const partitionFlashChartCanvas = ref<HTMLCanvasElement | null>(null);
const openFlashChartCanvas = ref<HTMLCanvasElement | null>(null);
let chipFamilyChart: Chart<"doughnut"> | null = null;
let partitionFlashChart: Chart<"doughnut"> | null = null;
let openFlashChart: Chart<"bar"> | null = null;
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
const DEFAULT_PARTITION_TABLE_OFFSET = 0x8000;
const PARTITION_TABLE_REGION_SIZE = 0x1000;

const totalBoards = computed(() => dashboardStats.value?.totalBoards ?? boards.value.length);
const availableBoards = computed(() => dashboardStats.value?.availableBoards ?? 0);
const inUseBoards = computed(() => dashboardStats.value?.inUseBoards ?? 0);
const brokenBoards = computed(() => dashboardStats.value?.brokenBoards ?? 0);
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
const boardsNeedingAttention = computed(
  () =>
    boards.value.filter((board) =>
      ["broken", "needs_flashing", "unknown"].includes(board.status)
    ).length
);
const unassignedBoards = computed(
  () => boards.value.filter((board) => !board.projectId).length
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
  partitionFlashChart?.destroy();
  openFlashChart?.destroy();
  themeObserver?.disconnect();
  chipFamilyChart = null;
  partitionFlashChart = null;
  openFlashChart = null;
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
  partitionChartKey,
  () => {
    void nextTick(renderPartitionCharts);
  }
);

function renderDashboardCharts(): void {
  renderChipFamilyChart();
  renderPartitionCharts();
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
          grid: {
            display: false
          },
          ticks: {
            color: getChartTextColor(),
            callback: (_value, index) =>
              truncateLabel(metrics[index]?.board.name ?? "Board")
          }
        }
      }
    }
  });
}

async function refreshDashboard(): Promise<void> {
  await Promise.all([boardStore.refresh(), projectStore.loadProjects()]);
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

function truncateLabel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}...` : value;
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

function getChartTextColor(): string {
  return getCssVariable("--vault-text", "#eef6f2");
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
              <canvas
                ref="openFlashChartCanvas"
                aria-label="Boards with the most open flash"
              />
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

    <div class="dashboard-snapshot">
      <div class="snapshot-panel">
        <div class="metric-label">Known memory</div>
        <div class="snapshot-values">
          <div class="memory-row">
            <div>
              <strong>{{ formatBytes(totalFlashBytes) }}</strong>
              <span class="memory-type">Flash memory</span>
            </div>
            <span>{{ formatRecordedCount(boardsWithKnownFlash) }}</span>
          </div>
          <div class="memory-row">
            <div>
              <strong>{{ formatBytes(totalPsramBytes) }}</strong>
              <span class="memory-type">PSRAM memory</span>
            </div>
            <span>{{ formatRecordedCount(boardsWithKnownPsram) }}</span>
          </div>
        </div>
      </div>
      <div class="snapshot-panel">
        <div class="metric-label">Board state</div>
        <div class="status-pills">
          <v-chip color="success" prepend-icon="mdi-check-circle-outline" size="small" variant="tonal">
            {{ availableBoards }} available
          </v-chip>
          <v-chip color="info" prepend-icon="mdi-play-circle-outline" size="small" variant="tonal">
            {{ inUseBoards }} in use
          </v-chip>
          <v-chip color="error" prepend-icon="mdi-alert-octagon-outline" size="small" variant="tonal">
            {{ brokenBoards }} broken
          </v-chip>
        </div>
      </div>
      <div class="snapshot-panel">
        <div class="metric-label">Lab organization</div>
        <div class="snapshot-values">
          <div>
            <strong>{{ unassignedBoards }}</strong>
            <span>Unassigned board{{ unassignedBoards === 1 ? "" : "s" }}</span>
          </div>
          <div>
            <strong>{{ dominantChipFamily }}</strong>
            <span>Dominant chip family</span>
          </div>
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

.status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
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
  height: 190px;
  margin-top: 12px;
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
  .partition-flash-summary {
    grid-template-columns: 1fr;
  }

  .chip-family-insights-grid,
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
  .dashboard-snapshot,
  .partition-insights-grid {
    grid-template-columns: 1fr;
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

  .partition-kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
