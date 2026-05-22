import { QueryClientProvider } from "@tanstack/react-query";
import { client } from "./query-client";
import { Workspace } from "./Workspace";

export function App() {
	return (
		<QueryClientProvider client={client}>
			<Workspace />
		</QueryClientProvider>
	);
}
