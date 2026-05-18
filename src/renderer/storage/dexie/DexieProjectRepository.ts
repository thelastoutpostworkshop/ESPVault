import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectInput
} from "../../../shared/types/inventory";
import { PROJECT_STATUSES } from "../../../shared/types/inventory";
import type {
  ProjectListFilters,
  ProjectRepository
} from "../../repositories/ProjectRepository";
import { vaultDatabase } from "./vaultDatabase";

export class DexieProjectRepository implements ProjectRepository {
  async list(filters: ProjectListFilters = {}): Promise<Project[]> {
    const projects = await vaultDatabase.projects
      .orderBy("updatedAt")
      .reverse()
      .toArray();

    return projects
      .map((project) => this.normalizeProject(project))
      .filter((project) => this.matchesFilters(project, filters));
  }

  async get(id: string): Promise<Project | null> {
    const project = await vaultDatabase.projects.get(id);
    return project ? this.normalizeProject(project) : null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      name: this.requireName(input.name),
      description: this.optionalText(input.description),
      location: this.optionalText(input.location),
      status: input.status ?? "active",
      coverImagePath: this.optionalText(input.coverImagePath),
      coverImageFilename: this.optionalText(input.coverImageFilename),
      coverImageMimeType: this.optionalText(input.coverImageMimeType),
      coverImageSizeBytes: this.optionalNumber(input.coverImageSizeBytes),
      createdAt: now,
      updatedAt: now
    };

    this.assertStatus(project.status);
    await vaultDatabase.projects.add(project);

    return project;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error("Project not found.");
    }

    const project: Project = {
      ...existing,
      name:
        input.name === undefined
          ? existing.name
          : this.requireName(input.name),
      description:
        input.description === undefined
          ? existing.description
          : this.optionalText(input.description),
      location:
        input.location === undefined
          ? existing.location
          : this.optionalText(input.location),
      status: input.status ?? existing.status,
      coverImagePath:
        input.coverImagePath === undefined
          ? existing.coverImagePath
          : this.optionalText(input.coverImagePath),
      coverImageFilename:
        input.coverImageFilename === undefined
          ? existing.coverImageFilename
          : this.optionalText(input.coverImageFilename),
      coverImageMimeType:
        input.coverImageMimeType === undefined
          ? existing.coverImageMimeType
          : this.optionalText(input.coverImageMimeType),
      coverImageSizeBytes:
        input.coverImageSizeBytes === undefined
          ? existing.coverImageSizeBytes
          : this.optionalNumber(input.coverImageSizeBytes),
      updatedAt: new Date().toISOString()
    };

    this.assertStatus(project.status);
    await vaultDatabase.projects.put(project);

    return project;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) {
      return false;
    }

    const boards = await vaultDatabase.boards
      .where("projectId")
      .equals(id)
      .toArray();

    await vaultDatabase.transaction(
      "rw",
      [vaultDatabase.projects, vaultDatabase.boards],
      async () => {
        await Promise.all(
          boards.map((board) =>
            vaultDatabase.boards.put({
              ...board,
              projectId: null,
              updatedAt: new Date().toISOString()
            })
          )
        );
        await vaultDatabase.projects.delete(id);
      }
    );

    return true;
  }

  private matchesFilters(
    project: Project,
    filters: ProjectListFilters
  ): boolean {
    const search = filters.search?.trim().toLowerCase();
    const matchesSearch =
      !search ||
      [project.name, project.description, project.location]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(search));
    const matchesStatus =
      !filters.status ||
      filters.status === "all" ||
      project.status === filters.status;

    return matchesSearch && matchesStatus;
  }

  private normalizeProject(project: Project): Project {
    const status = PROJECT_STATUSES.includes(project.status)
      ? project.status
      : "active";

    return {
      ...project,
      description: project.description ?? null,
      location: project.location ?? null,
      status,
      coverImagePath: project.coverImagePath ?? null,
      coverImageFilename: project.coverImageFilename ?? null,
      coverImageMimeType: project.coverImageMimeType ?? null,
      coverImageSizeBytes: project.coverImageSizeBytes ?? null
    };
  }

  private requireName(value: string): string {
    const name = value.trim();
    if (!name) {
      throw new Error("Project name is required.");
    }

    return name;
  }

  private optionalText(value: string | null | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private optionalNumber(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : null;
  }

  private assertStatus(value: ProjectStatus): void {
    if (!PROJECT_STATUSES.includes(value)) {
      throw new Error("Unsupported project status.");
    }
  }
}
