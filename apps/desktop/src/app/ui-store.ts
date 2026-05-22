import { create } from "zustand";

export const useUi = create<{
	selectedIncidentId: string | null;
	selectedEvidenceId: string | null;
	selectIncident: (id: string) => void;
	selectEvidence: (id: string | null) => void;
}>((set) => ({
	selectedIncidentId: null,
	selectedEvidenceId: null,
	selectIncident: (id) =>
		set({ selectedIncidentId: id, selectedEvidenceId: null }),
	selectEvidence: (id) => set({ selectedEvidenceId: id }),
}));
