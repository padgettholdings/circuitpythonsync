/** 
* @module fullQuickPick
*/

import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, Uri } from 'vscode';

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

export function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((_resolve, _reject) => {
        // noop
    });
}

export interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	items: T[];
	activeItem?: T;
	ignoreFocusOut?: boolean;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

export async function showFullQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>(
    { title,  items, activeItem, ignoreFocusOut, placeholder, buttons, shouldResume }: P) {
    const disposables: Disposable[] = [];
    try {
        return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
            const input = window.createQuickPick<T>();
            input.title = title;
            input.ignoreFocusOut = ignoreFocusOut ?? false;
            input.placeholder = placeholder;
            input.items = items;
            if (activeItem) {
                input.activeItems = [activeItem];
            }
            input.buttons = [
                ...(buttons || [])
            ];
            disposables.push(
                input.onDidTriggerButton(item => {
                        resolve((item as any));     
                }),
                input.onDidChangeSelection(items => resolve(items[0])),
                input.onDidHide(() => {
                    (async () => {
                        reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
                    })()
                        .catch(reject);
                })
            );
            // if (this.current) {
            //     this.current.dispose();
            // }
            //this.current = input;
            input.show();
        });
    } finally {
        disposables.forEach(d => d.dispose());
    }
}



