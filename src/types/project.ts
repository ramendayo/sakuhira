export type ProjectNotes = {
  lastWork: string;
  nextTask: string;
  updatedAt: number | null;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  launchUrl: string | null;
  notes: ProjectNotes;
  lastResumedAt: number | null;
};

export type SelectedDirectory = {
  path: string;
  suggestedName: string;
};
