# Notes de version

## v0.2.6

- Le routage Image Maker utilise maintenant une politique dédiée d'API Images compatible OpenAI au lieu d'ajouter les modèles de génération d'images au catalogue normal des modèles texte.
- Le routage avec image en entrée est plus strict : les prompts avec image exigent une planification routeBrain et des chaînes de rôles texte compatibles vision, tandis qu'Image Maker reste réservé à la génération ou l'édition d'images.
- Config Web fusionne catalogue, fournisseurs enregistrés, endpoint `/models` et saisie manuelle dans un seul flux d'ajout de modèle, avec prise en charge du listing Anthropic-compatible.
- L'estimation du budget contexte provider omet les octets des images inline tout en gardant les métadonnées, ce qui réduit les faux dépassements de contexte sur les prompts image.
- Le wrapper npm et les métadonnées de release sont en `0.2.6` pour correspondre aux assets GitHub de même version.

## v0.2.5

- La TUI passe à Ink 7 et React 19, et les lignes assistant/help du transcript rendent maintenant le Markdown via `markdansi`, afin que titres, listes, code inline, blocs de code et tableaux ne s'affichent plus comme du Markdown brut.
- Les dépendances runtime et frontend ont été rafraîchies, notamment les packages Pi `0.77.0`, Vite `8.0.14`, React Router `7.16.0` et TypeBox `1.1.39`.
- Le wrapper npm et les métadonnées de release sont en `0.2.5` pour correspondre aux assets GitHub de même version.

## v0.2.4

- `read_file` élargit maintenant automatiquement les fenêtres `limit` trop petites sur les gros fichiers et renvoie un `nextOffset` structuré, ce qui réduit les lectures page par page qui gonflent le transcript et le contexte provider.

## v0.2.3

- L'interface Config Web est organisée en onglets, avec Models en premier. L'onglet usage affiche les statistiques de tokens par modèle, rôle et phase d'exécution, avec graphiques Recharts et filtres de détail au clic.
- Les fournisseurs d'abonnement authentifiés via Pi OAuth, dont Claude Pro/Max, ChatGPT Plus/Pro Codex et GitHub Copilot, peuvent être sélectionnés dans le catalogue de modèles sans ressaisir de clé API.
- La ligne d'état running de la TUI a maintenant sa propre horloge à une seconde et une animation légère : le préfixe tourne et le libellé met en surbrillance un caractère à la fois.
- Le pliage du transcript de la TUI se fait au clavier avec `Ctrl+T`, qui bascule les lignes pliables entre affichage étendu et replié. Les appels d'outils restent courts par défaut, avec arguments et résumé de résultat dans le détail replié. La capture souris ne sert plus qu'à la molette et peut être désactivée avec `BRAINCODE_TUI_MOUSE=false`.
- Les erreurs provider de taille de message sont présentées comme une frontière de handoff Braincode. La TUI propose `/handoff` pour continuer depuis un paquet `@@session` compact au lieu de compresser silencieusement le transcript actif.
- Le cache d'évidence read-only réinitialise maintenant les entrées et compteurs de doublons après les outils write/execute, ce qui réduit les alertes stale duplicate-read.
- Le wrapper npm et les métadonnées de release sont en `0.2.3` pour correspondre aux assets GitHub de même version.

## v0.2.2

- Le pliage du transcript dans la TUI n'utilise plus les clics de souris et passe par `Ctrl+T`, afin que la sélection de texte et le pliage ne se concurrencent plus.
- Le rendu du transcript de la TUI utilise maintenant un viewport interne avec Up/Down quand la saisie est vide, PageUp/PageDown, Ctrl+Up/Ctrl+Down et molette souris, afin que le streaming ne force plus le repaint de tout le scrollback du terminal. L'historique des prompts est disponible avec Ctrl+P/Ctrl+N.
- BrainPet est maintenant ancré en bas à droite avec un rendu stable et peu rafraîchi par défaut, et affiche une progression contextuelle avec de courts apartés secs quand le contexte le permet. Définissez `BRAINCODE_TUI_ANIMATIONS=true` pour réactiver son animation.
- Le wrapper npm et les métadonnées de release sont en `0.2.2` pour correspondre aux assets GitHub de même version.
