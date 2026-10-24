export type Project = {
  id: string;
  name: string;
  path: string;
  launchUrl: string | null;
};

export type SelectedDirectory = {
  path: string;
  suggestedName: string;
};
