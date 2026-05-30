# Notes de version

## v0.2.7

- Les aperçus d'images dans le terminal prennent maintenant en charge le protocole graphique Kitty, avec un fallback half-block pour les terminaux sans images inline.
- Config Web ajoute un onglet de health check, un aperçu des permissions, un panneau OAuth, un flux unifié d'ajout de modèle, les valeurs par défaut GitHub Copilot OAuth et des avertissements plus clairs pour les challenges d'abonnement ChatGPT.
- Le runtime agent ajoute la permission policy v2 sensible aux chemins et commandes, la sélection intelligente des checks patch-kind, les aperçus de fichiers non suivis dans les reviews, ainsi que des améliorations de final report et de métriques.
- Le support MCP/projet améliore les health checks HTTP, le trust gating des serveurs, les lectures de fichiers fenêtrées, le listing des sessions, et migre le chemin des skills projet vers `.agents/skills`.
- Les benchmarks ajoutent des fixtures d'exécution, une démo login-validation, des métriques token-only et l'affichage de la confiance de review.
- Le wrapper npm et les métadonnées de release sont en `0.2.7` pour correspondre aux assets GitHub de même version.

## v0.2.6

- Image Maker utilise maintenant les modèles de génération d'images de `models.json` comme les autres rôles ; ajoutez-les avec le type d'API `openai-images`.
- Le routage avec image en entrée est plus strict : les prompts avec image exigent une planification routeBrain et des chaînes de rôles texte compatibles vision, tandis qu'Image Maker reste réservé à la génération ou l'édition d'images.
- Config Web fusionne catalogue, fournisseurs enregistrés, endpoint `/models` et saisie manuelle dans un seul flux d'ajout de modèle, avec prise en charge du listing Anthropic-compatible.
- GitHub Copilot OAuth utilise désormais `github.com` par défaut ; le champ de domaine GitHub Enterprise est masqué derrière une option explicite.
- Les tests de modèles via abonnement ChatGPT détectent maintenant les challenges navigateur ou Cloudflare de `chatgpt.com` et affichent un avertissement OAuth ciblé au lieu de toute la page HTML ; le panneau OAuth indique maintenant que ChatGPT subscription OAuth n'est pas recommandé pour des appels fiables et suggère ClIProxy API ou un autre proxy compatible.
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
