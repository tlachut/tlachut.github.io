let audioFiles = [];
let subjects = {};
let audioDataCache = localforage.createInstance({
    name: "audioData",
});
let isUpdatingDisplay = false;
const metadataStore = localforage.createInstance({
    name: "audioMetadata",
});

const audioDataStore = localforage.createInstance({
    name: "audioData",
});

const intervals = [
    { name: "1 dzień", value: 24 * 60 * 60 * 1000 },
    { name: "3 dni", value: 3 * 24 * 60 * 60 * 1000 },
    { name: "1 tydzień", value: 7 * 24 * 60 * 60 * 1000 },
    { name: "2 tygodnie", value: 14 * 24 * 60 * 60 * 1000 },
    { name: "1 miesiąc", value: 30 * 24 * 60 * 60 * 1000 },
    { name: "3 miesiące", value: 90 * 24 * 60 * 60 * 1000 },
    { name: "6 miesięcy", value: 6 * 30 * 24 * 60 * 60 * 1000 },
    { name: "12 miesięcy", value: 12 * 30 * 24 * 60 * 60 * 1000 },
];

document.addEventListener("DOMContentLoaded", async () => {
    const addAudioBtn = document.getElementById("addAudioBtn");
    const addAudioForm = document.getElementById("addAudioForm");
    const audioForm = document.getElementById("audioForm");
    const cancelAddBtn = document.getElementById("cancelAdd");
    const fileList = document.getElementById("fileList");
    const subjectFilter = document.getElementById("subjectFilter");
    const sortBy = document.getElementById("sortBy");
    const audioSubject = document.getElementById("audioSubject");
    const newSubject = document.getElementById("newSubject");
    const audioChapter = document.getElementById("audioChapter");
    const newChapter = document.getElementById("newChapter");
    const statisticsSection = document.getElementById("statistics");
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsPanel = document.getElementById("settingsPanel");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");
    const exportDataBtn = document.getElementById("exportDataBtn");
    const importDataBtn = document.getElementById("importDataBtn");
    const importDataInput = document.getElementById("importDataInput");
    const searchInput = document.getElementById("searchInput");
    const inputElement = document.querySelector('input[type="file"]');

    const pond = FilePond.create(inputElement);
    pond.setOptions({
        allowMultiple: false,
        acceptedFileTypes: ["audio/*"],
        labelIdle: 'Przeciągnij i upuść plik audio lub <span class="filepond--label-action"> Przeglądaj </span>',
        labelFileTypeNotAllowed: "Nieprawidłowy typ pliku",
        fileValidateTypeLabelExpectedTypes: "Oczekiwany typ pliku: {allTypes}",
        labelFileProcessingComplete: "Plik audio gotowy",
    });

    await loadFromIndexedDB();
    await migrateDataToIndexedDB();

    // Inicjalizacja eventListenerów i pozostałych funkcji
    initializeEventListeners();
    updateDisplay(); // Wywołujemy updateDisplay tylko raz po załadowaniu danych
    updateStatistics();

    console.log("Inicjalizacja zakończona, liczba plików:", audioFiles.length);

    function initializeEventListeners() {
        addAudioBtn.addEventListener("click", () => toggleAddAudioForm(true));
        cancelAddBtn.addEventListener("click", () => {
            toggleAddAudioForm(false);
            audioForm.reset();
            newSubject.style.display = "none";
            newChapter.style.display = "none";
        });

        settingsBtn.addEventListener("click", () => toggleSettingsPanel(true));
        closeSettingsBtn.addEventListener("click", () => toggleSettingsPanel(false));

        audioSubject.addEventListener("change", (e) => {
            if (e.target.value === "new") {
                newSubject.style.display = "block";
                audioChapter.innerHTML = '<option value="">Wybierz rozdział</option><option value="new">Dodaj nowy rozdział</option>';
            } else {
                newSubject.style.display = "none";
                updateChapterSelect(e.target.value);
            }
        });

        audioChapter.addEventListener("change", (e) => {
            if (e.target.value === "new") {
                newChapter.style.display = "block";
            } else {
                newChapter.style.display = "none";
            }
        });

        audioForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const pondFile = pond.getFiles()[0];
            if (pondFile && pondFile.file) {
                const file = pondFile.file;
                const title = document.getElementById("audioTitle").value;
                let subject = audioSubject.value;
                let chapter = audioChapter.value;

                if (subject === "new") {
                    subject = newSubject.value;
                    subjects[subject] = [];
                }

                if (chapter === "new") {
                    chapter = newChapter.value;
                    subjects[subject].push(chapter);
                }

                addAudioFile(file, title, chapter, subject);
                audioForm.reset();
                pond.removeFile();
                toggleAddAudioForm(false);
                updateSubjectSelect();
            } else {
                alert("Proszę wybrać plik audio.");
            }
        });

        exportDataBtn.addEventListener("click", exportData);
        importDataBtn.addEventListener("click", () => importDataInput.click());
        importDataInput.addEventListener("change", importData);

        searchInput.addEventListener("input", debounce(updateDisplay, 300));

        subjectFilter.addEventListener("change", updateDisplay);
        sortBy.addEventListener("change", updateDisplay);
    }

    function toggleAddAudioForm(show) {
        addAudioForm.style.display = show ? "block" : "none";
        addAudioBtn.style.display = show ? "none" : "block";
        settingsPanel.style.display = "none";
    }

    function toggleSettingsPanel(show) {
        settingsPanel.style.display = show ? "block" : "none";
        addAudioBtn.style.display = show ? "none" : "block";
        addAudioForm.style.display = "none";
    }

    function debounce(func, delay) {
        let debounceTimer;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function exportData() {
        const exportData = {
            audioFiles: audioFiles.map((file) => ({
                ...file,
                audioData: localStorage.getItem(`audio_${file.id}`),
            })),
            subjects: subjects,
        };
        const dataStr = JSON.stringify(exportData);
        const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

        const exportFileDefaultName = "nauka_z_powtorkami_dane.json";

        const linkElement = document.createElement("a");
        linkElement.setAttribute("href", dataUri);
        linkElement.setAttribute("download", exportFileDefaultName);
        linkElement.click();
    }

    function importData(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    audioFiles = importedData.audioFiles.map((file) => {
                        const { audioData, ...metadata } = file;
                        localStorage.setItem(`audio_${file.id}`, audioData);
                        return {
                            ...metadata,
                            addedDate: new Date(file.addedDate),
                            firstListenDate: file.firstListenDate ? new Date(file.firstListenDate) : null,
                            nextRepetition: file.nextRepetition ? new Date(file.nextRepetition) : null,
                            lastReviewedDate: file.lastReviewedDate ? new Date(file.lastReviewedDate) : null,
                        };
                    });
                    subjects = importedData.subjects;
                    saveToIndexedDB();
                    updateSubjectFilter();
                    updateSubjectSelect();
                    updateDisplay();
                    updateStatistics();
                    alert("Dane zostały pomyślnie zaimportowane!");
                } catch (error) {
                    console.error("Błąd podczas importowania danych:", error);
                    alert("Wystąpił błąd podczas importowania danych. Sprawdź, czy wybrany plik jest prawidłowy.");
                }
            };
            reader.readAsText(file);
        }
    }

    function updateSubjectFilter() {
        const subjectSet = new Set(audioFiles.map((file) => file.subject));
        subjectFilter.innerHTML = '<option value="">Wszystkie przedmioty</option>';
        subjectSet.forEach((subject) => {
            subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
        });
    }

    function updateSubjectSelect() {
        audioSubject.innerHTML = '<option value="">Wybierz przedmiot</option>';
        for (let subject in subjects) {
            audioSubject.innerHTML += `<option value="${subject}">${subject}</option>`;
        }
        audioSubject.innerHTML += '<option value="new">Dodaj nowy przedmiot</option>';
    }

    function updateChapterSelect(subject) {
        audioChapter.innerHTML = '<option value="">Wybierz rozdział</option>';
        if (subjects[subject]) {
            subjects[subject].forEach((chapter) => {
                audioChapter.innerHTML += `<option value="${chapter}">${chapter}</option>`;
            });
        }
        audioChapter.innerHTML += '<option value="new">Dodaj nowy rozdział</option>';
    }

    function updateStatistics() {
        const statsContent = document.getElementById("statsContent");
        const totalFiles = audioFiles.length;
        const listenedFiles = audioFiles.filter((file) => file.firstListenDate).length;
        const filesReadyForReview = audioFiles.filter((file) => canReview(file)).length;

        const avgReviewsPerFile =
            audioFiles.reduce((sum, file) => {
                return sum + (file.currentIntervalIndex + 1);
            }, 0) / totalFiles || 0;

        const mostReviewedFile = audioFiles.reduce(
            (max, file) => {
                return file.currentIntervalIndex > max.currentIntervalIndex ? file : max;
            },
            { currentIntervalIndex: -1 }
        );

        statsContent.innerHTML = `
            <p>Całkowita liczba plików: ${totalFiles}</p>
            <p>Liczba odsłuchanych plików: ${listenedFiles}</p>
            <p>Pliki gotowe do powtórki: ${filesReadyForReview}</p>
            <p>Średnia liczba powtórek na plik: ${avgReviewsPerFile.toFixed(2)}</p>
            ${mostReviewedFile.title ? `<p>Najbardziej powtarzany plik: "${mostReviewedFile.title}" (${mostReviewedFile.currentIntervalIndex + 1} powtórek)</p>` : ""}
        `;
    }

    // Dodaj tę funkcję do kompresji danych audio
    function compressAudioData(audioData) {
        // W tym przypadku nie kompresujemy danych audio, ponieważ to może prowadzić do utraty jakości
        // Zamiast tego, po prostu zwracamy oryginalne dane
        return Promise.resolve(audioData);
    }

    async function addAudioFile(file, title, chapter, subject) {
        console.log("Rozpoczęcie dodawania nowego pliku audio");
        console.log("Tytuł:", title, "Rozdział:", chapter, "Przedmiot:", subject);

        const reader = new FileReader();
        reader.onload = async (e) => {
            console.log("Plik audio wczytany");
            const audioData = e.target.result;
            const compressedAudioData = await compressAudioData(audioData);
            console.log("Dane audio skompresowane");

            const newFile = {
                id: Date.now(),
                title,
                chapter,
                subject,
                addedDate: new Date(),
                firstListenDate: null,
                nextRepetition: null,
                currentIntervalIndex: -1,
                lastReviewedDate: null,
            };
            console.log("Nowy plik:", newFile);

            try {
                await audioDataStore.setItem(newFile.id.toString(), compressedAudioData);
                console.log("Dane audio zapisane w IndexedDB");

                audioFiles.push(newFile);
                await saveToIndexedDB();
                updateSubjectFilter();
                updateDisplay();
                updateStatistics();
                console.log("Plik audio dodany i wyświetlony");
            } catch (error) {
                console.error("Błąd podczas zapisywania danych audio:", error);
                alert("Wystąpił błąd podczas zapisywania pliku audio. Spróbuj ponownie.");
            }
        };
        reader.readAsDataURL(file);
    }

    async function renderAudioFile(file) {
        console.log("Rozpoczęcie renderowania pliku:", file.id);
        const fileItem = document.createElement("div");
        fileItem.className = "file-item";
        fileItem.dataset.fileId = file.id;

        try {
            const audioData = await audioDataStore.getItem(file.id.toString());
            if (!audioData) {
                throw new Error("Dane audio niedostępne");
            }
            fileItem.innerHTML = `
                <h3>${file.title}</h3>
                <p>${file.chapter}, ${file.subject}</p>
                <p>Data dodania: ${formatDate(file.addedDate)}</p>
                <p class="first-listen-date">Data pierwszego odsłuchania: ${file.firstListenDate ? formatDate(file.firstListenDate) : "Jeszcze nie odsłuchano"}</p>
                <p class="next-repetition">Następne powtórzenie: ${getNextRepetitionText(file)}</p>
                <audio controls>
                    <source src="${audioData}" type="audio/mpeg">
                    Twoja przeglądarka nie obsługuje elementu audio.
                </audio>
                <button class="btn btn-primary review-btn" data-id="${file.id}">Oznacz jako przesłuchane</button>
                <button class="btn btn-secondary delete-btn" data-id="${file.id}">Usuń</button>
            `;
        } catch (error) {
            console.error("Błąd podczas wczytywania danych audio:", error);
            fileItem.innerHTML = `
                <h3>${file.title}</h3>
                <p>${file.chapter}, ${file.subject}</p>
                <p>Data dodania: ${formatDate(file.addedDate)}</p>
                <p class="first-listen-date">Data pierwszego odsłuchania: ${file.firstListenDate ? formatDate(file.firstListenDate) : "Jeszcze nie odsłuchano"}</p>
                <p class="next-repetition">Następne powtórzenie: ${getNextRepetitionText(file)}</p>
                <p>Błąd wczytywania danych audio</p>
                <button class="btn btn-primary review-btn" data-id="${file.id}">Oznacz jako przesłuchane</button>
                <button class="btn btn-secondary delete-btn" data-id="${file.id}">Usuń</button>
            `;
        }

        const existingFileItem = fileList.querySelector(`[data-file-id="${file.id}"]`);
        if (existingFileItem) {
            console.log(`Plik ${file.id} już istnieje, aktualizuję`);
            fileList.replaceChild(fileItem, existingFileItem);
        } else {
            console.log(`Dodaję nowy plik ${file.id}`);
            fileList.appendChild(fileItem);
        }

        const reviewBtn = fileItem.querySelector(".review-btn");
        reviewBtn.addEventListener("click", () => handleRepetition(file.id));
        updateReviewButtonState(reviewBtn, file);

        const deleteBtn = fileItem.querySelector(".delete-btn");
        deleteBtn.addEventListener("click", () => deleteAudioFile(file.id));

        console.log("Zakończenie renderowania pliku:", file.id);
    }

    function handleRepetition(fileId) {
        const file = audioFiles.find((f) => f.id === fileId);
        if (file) {
            const now = new Date();
            if (!file.firstListenDate) {
                file.firstListenDate = now;
                file.nextRepetition = new Date(now.getTime() + intervals[0].value);
                file.currentIntervalIndex = 0;
            } else if (canReview(file)) {
                file.currentIntervalIndex++;
                if (file.currentIntervalIndex >= intervals.length) {
                    file.currentIntervalIndex = intervals.length - 1;
                }
                file.nextRepetition = new Date(now.getTime() + intervals[file.currentIntervalIndex].value);
            }
            file.lastReviewedDate = now;
            saveToIndexedDB();
            updateFileDisplay(file);
            updateStatistics();
        }
    }

    function canReview(file) {
        return file.firstListenDate && new Date() >= file.nextRepetition;
    }

    function showNotification(message, type = "info") {
        const notification = document.createElement("div");
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 3000);
    }

    async function deleteAudioFile(fileId) {
        const file = audioFiles.find((f) => f.id === fileId);
        if (file) {
            const confirmMessage = `Czy na pewno chcesz usunąć plik "${file.title}"?`;
            if (confirm(confirmMessage)) {
                audioFiles = audioFiles.filter((f) => f.id !== fileId);
                try {
                    await audioDataStore.removeItem(fileId.toString());
                    console.log(`Dane audio dla pliku "${file.title}" zostały usunięte.`);
                } catch (error) {
                    console.error("Błąd podczas usuwania danych audio:", error);
                }
                await saveToIndexedDB();
                updateSubjectFilter();
                updateDisplay();
                updateStatistics();
                console.log(`Plik audio "${file.title}" został usunięty.`);
                showNotification(`Plik "${file.title}" został usunięty.`, "success");
            } else {
                console.log("Usuwanie pliku audio anulowane przez użytkownika.");
            }
        } else {
            console.log("Nie znaleziono pliku audio o podanym ID.");
        }
    }

    function updateFileDisplay(file) {
        const fileItem = document.querySelector(`[data-id="${file.id}"]`).closest(".file-item");
        fileItem.querySelector(".first-listen-date").textContent = `Data pierwszego odsłuchania: ${file.firstListenDate ? formatDate(file.firstListenDate) : "Jeszcze nie odsłuchano"}`;
        fileItem.querySelector(".next-repetition").textContent = `Następne powtórzenie: ${getNextRepetitionText(file)}`;
        const reviewBtn = fileItem.querySelector(".review-btn");
        updateReviewButtonState(reviewBtn, file);
    }

    function updateReviewButtonState(button, file) {
        if (!file.firstListenDate) {
            button.disabled = false;
            button.textContent = "Oznacz jako przesłuchane po raz pierwszy";
        } else if (canReview(file)) {
            button.disabled = false;
            button.textContent = "Oznacz jako przesłuchane";
        } else {
            button.disabled = true;
            const timeLeft = getTimeLeft(file.nextRepetition);
            button.textContent = `Dostępne za ${timeLeft}`;
        }
    }

    function getNextRepetitionText(file) {
        if (!file.firstListenDate) {
            return "Oczekuje na pierwsze odsłuchanie";
        } else if (new Date() >= file.nextRepetition) {
            return "Teraz";
        } else {
            return formatDate(file.nextRepetition);
        }
    }

    function formatDate(date) {
        return date.toLocaleString("pl-PL", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getTimeLeft(date) {
        const diff = date - new Date();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}min`;
    }

    function checkStorageUsage() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            total += localStorage.getItem(key).length;
        }
        const totalInMB = (total / 1024 / 1024).toFixed(2);
        console.log(`Całkowite wykorzystanie localStorage: ${totalInMB} MB`);
        if (totalInMB > 4) {
            alert(`Uwaga: Wykorzystanie pamięci localStorage przekroczyło 4 MB (${totalInMB} MB). Rozważ usunięcie niektórych plików.`);
        }
    }

    async function saveToIndexedDB() {
        console.log("Zapisywanie danych do IndexedDB");
        try {
            await metadataStore.setItem("audioFiles", audioFiles);
            await metadataStore.setItem("subjects", subjects);
            console.log("Dane zapisane w IndexedDB");
        } catch (error) {
            console.error("Błąd podczas zapisywania danych do IndexedDB:", error);
        }
    }

    async function loadFromIndexedDB() {
        console.log("Rozpoczęcie ładowania danych z IndexedDB");
        try {
            const savedFiles = await metadataStore.getItem("audioFiles");
            const savedSubjects = await metadataStore.getItem("subjects");

            if (savedFiles) {
                audioFiles = savedFiles.map((file) => ({
                    ...file,
                    addedDate: new Date(file.addedDate),
                    firstListenDate: file.firstListenDate ? new Date(file.firstListenDate) : null,
                    nextRepetition: file.nextRepetition ? new Date(file.nextRepetition) : null,
                    lastReviewedDate: file.lastReviewedDate ? new Date(file.lastReviewedDate) : null,
                }));
            }

            if (savedSubjects) {
                subjects = savedSubjects;
            }

            console.log("Załadowane pliki audio:", audioFiles);
            console.log("Załadowane przedmioty:", subjects);
        } catch (error) {
            console.error("Błąd podczas ładowania danych z IndexedDB:", error);
        }
    }

    function cleanupUnusedAudioData() {
        const audioFileIds = new Set(audioFiles.map((file) => file.id));
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith("audio_") && !audioFileIds.has(parseInt(key.slice(6)))) {
                localStorage.removeItem(key);
            }
        }
    }

    function updateDisplay() {
        if (isUpdatingDisplay) {
            console.log("Aktualizacja wyświetlania już w toku, pomijam...");
            return;
        }
        isUpdatingDisplay = true;

        console.log("Rozpoczęcie aktualizacji wyświetlania");
        console.log("Aktualna zawartość audioFiles:", audioFiles);

        const selectedSubject = subjectFilter.value;
        const selectedSort = sortBy.value;
        const searchQuery = searchInput.value.toLowerCase().trim();

        console.log("Wybrany przedmiot:", selectedSubject);
        console.log("Wybrane sortowanie:", selectedSort);
        console.log("Fraza wyszukiwania:", searchQuery);

        let filteredFiles = [...audioFiles];
        console.log("Liczba wszystkich plików:", filteredFiles.length);

        if (selectedSubject) {
            filteredFiles = filteredFiles.filter((file) => file.subject === selectedSubject);
            console.log("Liczba plików po filtrowaniu przedmiotu:", filteredFiles.length);
        }

        if (searchQuery) {
            filteredFiles = filteredFiles.filter((file) => file.title.toLowerCase().includes(searchQuery) || file.chapter.toLowerCase().includes(searchQuery) || file.subject.toLowerCase().includes(searchQuery));
            console.log("Liczba plików po wyszukiwaniu:", filteredFiles.length);
        }

        filteredFiles.sort((a, b) => {
            switch (selectedSort) {
                case "title":
                    return a.title.localeCompare(b.title);
                case "nextRepetition":
                    return (a.nextRepetition || new Date(0)) - (b.nextRepetition || new Date(0));
                default: // 'date'
                    return b.addedDate - a.addedDate;
            }
        });

        console.log("Posortowane pliki:", filteredFiles);

        fileList.innerHTML = "";

        if (filteredFiles.length === 0) {
            console.log("Brak plików do wyświetlenia");
            fileList.innerHTML = "<p>Brak wyników pasujących do wyszukiwania.</p>";
        } else {
            console.log("Renderowanie plików, liczba:", filteredFiles.length);
            filteredFiles.forEach((file, index) => {
                console.log(`Renderowanie pliku ${index + 1}:`, file);
                renderAudioFile(file);
            });
        }

        updateStatistics();
        isUpdatingDisplay = false;
    }

    updateStatistics();
    loadFromIndexedDB();

    async function migrateDataToIndexedDB() {
        const oldSavedFiles = localStorage.getItem("audioFiles");
        if (oldSavedFiles) {
            console.log("Znaleziono dane w starym formacie. Rozpoczęcie migracji...");
            const oldFiles = JSON.parse(oldSavedFiles);
            for (const file of oldFiles) {
                const { audioData, ...metadata } = file;
                await audioDataCache.setItem(file.id.toString(), audioData);
                audioFiles.push({
                    ...metadata,
                    addedDate: new Date(file.addedDate),
                    firstListenDate: file.firstListenDate ? new Date(file.firstListenDate) : null,
                    nextRepetition: file.nextRepetition ? new Date(file.nextRepetition) : null,
                    lastReviewedDate: file.lastReviewedDate ? new Date(file.lastReviewedDate) : null,
                });
            }
            localStorage.removeItem("audioFiles");
            saveToIndexedDB();
            console.log("Migracja zakończona.");
        }
    }
});

function logAudioFilesState() {
    console.log("Aktualny stan audioFiles:", audioFiles);
    console.log("Liczba elementów w fileList:", fileList.children.length);
}

logAudioFilesState();
