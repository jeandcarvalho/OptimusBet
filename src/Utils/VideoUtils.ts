// utils/utils.ts
export const extrairIdGoogleDrive = (link: string | undefined): string | null => {
    if (link && link.includes("/file/d/")) {
        const startIdx = link.indexOf("/file/d/") + "/file/d/".length;
        const endIdx = link.indexOf("/view", startIdx);
        return link.substring(startIdx, endIdx);
    } else if (link && link.includes("id=")) {
        const startIdx = link.indexOf("id=") + "id=".length;
        return link.substring(startIdx);
    } else {
        return null;
    }
};

export const formatString = (input: string): string => {
    return input.split(',').map(part => part.trim()).join(', ');
};

export const changeViewToPreview = (link: string): string => {
    return link.includes("/view") ? link.replace("/view", "/preview") : link;
};
