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
};

export type SelectedDirectory = {
  path: string;
  suggestedName: string;
};
