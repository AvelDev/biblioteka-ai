import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./components/Auth";

const BOOK_STATUS = {
  TO_READ: "DO PRZECZYTANIA",
  READING: "W TRAKCIE",
  READ: "PRZECZYTANE",
  ABANDONED: "PORZUCONE",
};

const App = () => {
  const [session, setSession] = useState(null);
  const [books, setBooks] = useState({
    [BOOK_STATUS.TO_READ]: [],
    [BOOK_STATUS.READING]: [],
    [BOOK_STATUS.READ]: [],
    [BOOK_STATUS.ABANDONED]: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Sprawdź aktualną sesję
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserBooks();
      }
    });

    // Nasłuchuj zmian w autoryzacji
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserBooks();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserBooks = async () => {
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", session.user.id);

      if (error) throw error;

      const organizedBooks = {
        [BOOK_STATUS.TO_READ]: [],
        [BOOK_STATUS.READING]: [],
        [BOOK_STATUS.READ]: [],
        [BOOK_STATUS.ABANDONED]: [],
      };

      data.forEach((book) => {
        organizedBooks[book.status].push(book);
      });

      setBooks(organizedBooks);
    } catch (error) {
      console.error("Błąd podczas pobierania książek:", error);
    }
  };

  const searchBooks = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
          searchQuery
        )}&maxResults=5`
      );
      const data = await response.json();

      const formattedResults =
        data.items?.map((book) => ({
          id: book.id,
          title: book.volumeInfo.title,
          authors: book.volumeInfo.authors?.join(", ") || "Nieznany autor",
          cover: book.volumeInfo.imageLinks?.thumbnail || "/placeholder-book.png",
          isbn: book.volumeInfo.industryIdentifiers?.[0]?.identifier || "Brak ISBN",
          description: book.volumeInfo.description || "Brak opisu",
        })) || [];

      setSearchResults(formattedResults);
    } catch (error) {
      console.error("Błąd podczas wyszukiwania:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBook = async (book) => {
    try {
      const now = new Date().toISOString();
      const newBook = {
        user_id: session.user.id,
        title: book.title,
        authors: book.authors,
        cover: book.cover,
        isbn: book.isbn,
        description: book.description,
        status: BOOK_STATUS.TO_READ,
        added_at: now,
        created_at: now
      };

      console.log('Próba zapisania książki:', newBook);
      const { data, error } = await supabase
        .from("books")
        .insert([newBook])
        .select();

      if (error) {
        console.error('Szczegóły błędu:', error);
        throw error;
      }

      console.log('Książka zapisana:', data);
      const savedBook = data[0];

      setBooks((prev) => ({
        ...prev,
        [BOOK_STATUS.TO_READ]: [...prev[BOOK_STATUS.TO_READ], savedBook],
      }));
      setSearchResults([]);
      setSearchQuery("");
    } catch (error) {
      console.error("Błąd podczas dodawania książki:", error);
      alert(`Nie udało się dodać książki: ${error.message}`);
    }
  };

  const handleStatusChange = async (bookId, fromStatus, toStatus) => {
    try {
      const { error } = await supabase
        .from("books")
        .update({
          status: toStatus,
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", bookId)
        .eq("user_id", session.user.id);

      if (error) throw error;

      setBooks((prev) => {
        const book = prev[fromStatus].find((b) => b.id === bookId);
        if (!book) return prev;

        const updatedBook = {
          ...book,
          status: toStatus,
          status_changed_at: new Date().toISOString(),
        };

        return {
          ...prev,
          [fromStatus]: prev[fromStatus].filter((b) => b.id !== bookId),
          [toStatus]: [...prev[toStatus], updatedBook],
        };
      });
    } catch (error) {
      console.error("Błąd podczas aktualizacji statusu:", error);
      alert(`Nie udało się zaktualizować statusu: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Błąd podczas wylogowywania:", error);
    }
  };

  const BookList = ({ status, books }) => (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{status}</h2>
        <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
          {books.length}
        </span>
      </div>
      {books.length === 0 ? (
        <p className="text-gray-500">Brak książek</p>
      ) : (
        <ul className="space-y-4">
          {books.map((book) => (
            <li key={book.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
              <img
                src={book.cover}
                alt={book.title}
                className="w-24 h-32 object-cover rounded"
              />
              <div className="flex-1">
                <h3 className="font-semibold">{book.title}</h3>
                <p className="text-sm text-gray-600">Autor: {book.authors}</p>
                <p className="text-sm text-gray-600">ISBN: {book.isbn}</p>
                <p className="text-sm text-gray-600">
                  Dodano: {new Date(book.added_at).toLocaleDateString()}
                </p>
                {book.status_changed_at && (
                  <p className="text-sm text-gray-600">
                    Zmieniono:{" "}
                    {new Date(book.status_changed_at).toLocaleDateString()}
                  </p>
                )}
                <div className="mt-2 flex gap-2 flex-wrap">
                  {Object.values(BOOK_STATUS)
                    .filter((s) => s !== status)
                    .map((newStatus) => (
                      <button
                        key={newStatus}
                        onClick={() =>
                          handleStatusChange(book.id, status, newStatus)
                        }
                        className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition"
                      >
                        Przenieś do: {newStatus}
                      </button>
                    ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Moja Biblioteczka
          </h1>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Wyloguj się
          </button>
        </div>

        {/* Wyszukiwarka książek */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Wyszukaj książkę</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && searchBooks()}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Wpisz tytuł książki"
            />
            <button
              onClick={searchBooks}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              disabled={isLoading}
            >
              {isLoading ? "Szukam..." : "Szukaj"}
            </button>
          </div>

          {/* Wyniki wyszukiwania */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-4">
              {searchResults.map((book) => (
                <div
                  key={book.id}
                  className="flex gap-4 p-4 bg-gray-50 rounded-lg"
                >
                  <img
                    src={book.cover}
                    alt={book.title}
                    className="w-24 h-32 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold">{book.title}</h3>
                    <p className="text-sm text-gray-600">
                      Autor: {book.authors}
                    </p>
                    <p className="text-sm text-gray-600">ISBN: {book.isbn}</p>
                    <button
                      onClick={() => handleAddBook(book)}
                      className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                    >
                      Dodaj do listy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Listy książek */}
        {Object.entries(books).map(([status, booksList]) => (
          <BookList key={status} status={status} books={booksList} />
        ))}

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-600 text-sm">
          <p>
            Kod źródłowy dostępny na{" "}
            <a
              href="https://github.com/AvelDev/biblioteka-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
