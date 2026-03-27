# Puzzle Plan Notes

Original planning notes and answers preserved from the working conversation.

## Answers

1. What is the actual v1 puzzle source?

- Personal review-derived puzzles only, imported Lichess puzzles only, or both at launch?

The v1 puzzle source should be coming from our reviewed games shared to the library, and the lichess downloaded database saved in our repo. so two sources present in the same library as top level distinctions.

2. If both sources exist, do they share one puzzle runtime but different data models, or do you want one unified puzzle model?

- This matters because imported Lichess puzzles and personal review-derived puzzles do not have the same guarantees.

What would you recommend here?

3. What are the only approved ways to create a personal puzzle in v1?

yes all listed below here

- Save from Learn From Your Mistakes
- Bulk-save missed moments after review
- Right-click any move and create a puzzle
- all of the above
- And the user should also be able to import baches of puzzles they personally own manually into their library (upload from desktop) im not sure the correct formats here, but lets be as wide ranging as possible

4. If a user right-clicks any move and creates a puzzle, what is the answer key?

- when the user right clicks a move to create a puzzle, it should ask, is this the puzzle solution move or the puzzle start position?
- Based off that answer follow to seperate logic flows. If the user is selecting the solution as the move, then the puzzle should be started from the move prior with the selected move being treated as the correct solution.
- If the user is selecting the start puzzle start position, then the engine best move should be set as correct. Giving the user a chance to verify that move before saving.

5. Do you want strict correctness or graded correctness as the core puzzle rule?

- Strict correctness should exist for the puzzle to be marked as solved.
- Graded correctness is fine in the ui, “wrong but okay” can still receive structured feedback.

6. If you want graded correctness, should that apply to all puzzle types or only personal Patzer puzzles?

I want the graded correctness ui to show on each puzzle ever loaded into the site. Yet the correct solution state in the log for puzzle should only change if it was answered the true correct answer.

Assume the same rule for any database present in patzer pro, imported or otherwise.

7. What exact actions should mark a puzzle as not solved cleanly?

- Wrong first move
- Any wrong move in sequence
- Hint used
- Engine arrows shown
- Engine lines shown
- Notes opened
- Solution revealed
- Skip pressed

8. Do you want more than one failure state?

- Yes, but lets maybe expand if needed: clean solve, recovered solve, assisted solve, skipped
- This matters for spaced repetition and stats.
- Lets have a detailed meta data for failure state logs. so we can use that info in the future

9. Is “engine always on in the background” a hard product requirement for v1, or a desired enhancement?

hard requirement so that the puzzle feedback loads instantly.

- This is an important scope and performance decision, not a small detail.

10. If engine is always on, what exact feedback should it produce after a non-best move?

- eval change amount. displayed as a number like 1.0 or .4 or .-4
- The eval change amount should be treated from the baseline the user is solving the puzzle from. So a positive number improvement is good for if you are black or white. The baseline eval for black my be a change from -2 to -4 and that should read as a +2 improvement as the eval bar would've moved 2 in the direction of the user. Which in this implementation should be read as a positive improvement even though black evals are shown as negative numbers.
- Better/worse/best label
- Best move reveal only if the user selects that option.
- Retry prompt on anything less than the best option.

11. Should engine feedback ever override strict puzzle validation?

- Example: if the stored solution says move A, but the engine thinks move B is also fine, what wins? The stored solution wins, but there should be a notification that the engine thinks XX move is better with eval difference between the two shown.

12. For personal saved puzzles, what metadata is required at save time?

- Full PGN
- Source game id
- FEN
- Solution line
- Title
- Notes
- Tags
- Folder
- Created timestamp
- Attempt history
- Source reason
and whatever other metadata we might feel is helpful for future sorting or completion

13. For imported Lichess puzzles, do you require full PGN in v1?

- If yes, are you explicitly accepting that this requires a second source-game ingestion pipeline, not just the puzzle database?

- I dont know what you wrote above means

14. Are folders flat or nested?

- I dont know the difference.

14. Can one puzzle belong to multiple folders or only one?

- yes. So someone should be able to have a favorites folder etc. Or theme based folders.

14. Is completion status global per puzzle, or can the same puzzle be “done” in one folder and “not done” in another?

- completion and spaced repition status is global

15. What should the default library load behavior be?

When the library loads it should show Imported Puzzles (lichess)
And User Libary (thats what we should call the user folders)
When opening the folders of the user library should be sorted alphabetically
when a folder is opened the list of puzzles should sort the failed-first-attempt puzzles to the top and then the Unsolved +

15. What is the minimum spaced repetition behavior for v1?

- Just “retry failed earlier”
If you failed a puzzle once. And later got it correct. You should be able to select some time down the road, maybe a week or so, to do the puzzle again and ensure that you still know the correct answer. The logic for this is not fully thought out, but I want the idea present in the build of repetition.

16. Do you want the first real planning doc to treat board ownership cleanup as a prerequisite?

- Meaning: define the shared board subsystem first, then build the puzzle product on top of it.
- yes. Board ownership cleanup is a preequisite.

17. What is explicitly out of scope for the first puzzle build phase?

- Login/user accounts
- Cloud sync

I forgot that down the line I would like to implement rated puzzle progression algorythims. So the user has a Puzzle rating that is updated and changed based of the rating level of the correctly completed puzzles. The puzzle library on the bottom should have a toggle to turn "Rated" mode on or off. This is a future implementation to keep in mind, but not required.
