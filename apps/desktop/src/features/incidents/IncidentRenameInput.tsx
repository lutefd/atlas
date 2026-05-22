import React, { useEffect, useState } from "react";

export function IncidentRenameInput({
	initialTitle,
	onSave,
	onCancel,
	className = "incident-rename",
}: {
	initialTitle: string;
	onSave: (title: string) => void;
	onCancel: () => void;
	className?: string;
}) {
	const [value, setValue] = useState(initialTitle);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const didFocus = React.useRef(false);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		el.select();
		didFocus.current = true;
	}, []);

	return (
		<input
			ref={inputRef}
			className={className}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					onSave(value);
				}
				if (e.key === "Escape") onCancel();
			}}
			onBlur={() => {
				if (!didFocus.current) return;
				if (value.trim() !== initialTitle.trim()) onSave(value);
				else onCancel();
			}}
		/>
	);
}
