package one.zrp.social.mobile.ui.play

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PlayRepository

/** Create Challenge - ported from CreateChallengePage.tsx. */
@Composable
fun PlayCreateChallengeScreen(onBack: () -> Unit, onCreated: (String) -> Unit) {
    val viewModel: PlayCreateChallengeViewModel = viewModel(
        factory = remember { PlayCreateChallengeViewModelFactory(PlayRepository()) },
    )
    val state by viewModel.state.collectAsState()

    val createdId = state.createdChallengeId
    LaunchedEffect(createdId) {
        if (createdId != null) onCreated(createdId)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.play_back_to_play))
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Text(text = stringResource(R.string.play_create_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                text = stringResource(R.string.play_create_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                FilterChip(
                    selected = state.tab == "manual",
                    onClick = { viewModel.setTab("manual") },
                    label = { Text(stringResource(R.string.play_manual_tab)) },
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    selected = state.tab == "ai",
                    onClick = { viewModel.setTab("ai") },
                    leadingIcon = { Icon(Icons.Filled.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp)) },
                    label = { Text(stringResource(R.string.play_ai_tab)) },
                    modifier = Modifier.weight(1f),
                )
            }

            val errorText = when (state.error) {
                PlayCreateChallengeViewModel.titleRequiredError -> stringResource(R.string.play_err_title_required)
                PlayCreateChallengeViewModel.generateFailedError -> stringResource(R.string.play_err_generate_failed)
                PlayCreateChallengeViewModel.createFailedError -> stringResource(R.string.play_err_create_failed)
                else -> null
            }
            if (errorText != null) {
                Text(text = errorText, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp))
            }

            Text(text = stringResource(R.string.play_challenge_type), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                allChallengeTypes.forEach { type ->
                    FilterChip(
                        selected = state.type == type,
                        onClick = { viewModel.setType(type) },
                        label = { Text(challengeTypeLabel(type)) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Text(text = stringResource(R.string.play_difficulty_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
                listOf("easy", "medium", "hard").forEach { difficulty ->
                    FilterChip(
                        selected = state.difficulty == difficulty,
                        onClick = { viewModel.setDifficulty(difficulty) },
                        label = { Text(difficultyLabel(difficulty)) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            if (state.tab == "ai") {
                Text(text = stringResource(R.string.play_ai_topic_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                OutlinedTextField(
                    value = state.aiTopic,
                    onValueChange = viewModel::setAiTopic,
                    placeholder = { Text(stringResource(R.string.play_ai_topic_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = viewModel::generate,
                    enabled = state.aiTopic.isNotBlank() && !state.generating,
                    modifier = Modifier.padding(top = 12.dp, bottom = 24.dp),
                ) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        text = stringResource(if (state.generating) R.string.play_generating else R.string.play_generate),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            } else {
                if (state.aiGenerated) {
                    Text(
                        text = stringResource(R.string.play_ai_generated_note),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }

                Text(text = stringResource(R.string.play_title_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                OutlinedTextField(
                    value = state.title,
                    onValueChange = viewModel::setTitle,
                    placeholder = { Text(stringResource(R.string.play_title_placeholder)) },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                )

                Text(text = stringResource(R.string.play_description_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                OutlinedTextField(
                    value = state.description,
                    onValueChange = viewModel::setDescription,
                    placeholder = { Text(stringResource(R.string.play_description_placeholder)) },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                )

                when (state.type) {
                    "TRIVIA" -> TriviaBuilder(state, viewModel)
                    "MEMORY" -> MemoryBuilder(state, viewModel)
                    else -> LogicBuilder(state, viewModel)
                }

                Button(
                    onClick = viewModel::publish,
                    enabled = !state.submitting,
                    modifier = Modifier.padding(top = 16.dp, bottom = 32.dp),
                ) {
                    if (state.submitting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                        Text(text = stringResource(R.string.play_publishing), modifier = Modifier.padding(start = 6.dp))
                    } else {
                        Text(stringResource(R.string.play_publish))
                    }
                }
            }
        }
    }
}

@Composable
private fun TriviaBuilder(state: PlayCreateChallengeUiState, viewModel: PlayCreateChallengeViewModel) {
    Text(text = stringResource(R.string.play_questions_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.questions.forEachIndexed { qIndex, question ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = question.q,
                        onValueChange = { viewModel.setQuestionText(qIndex, it) },
                        placeholder = { Text(stringResource(R.string.play_question_placeholder)) },
                        modifier = Modifier.weight(1f),
                    )
                    if (state.questions.size > 1) {
                        IconButton(onClick = { viewModel.removeQuestion(qIndex) }) {
                            Icon(Icons.Filled.Delete, contentDescription = null)
                        }
                    }
                }
                val markCorrectLabel = stringResource(R.string.play_mark_correct)
                question.options.forEachIndexed { optIndex, option ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp, top = 4.dp)) {
                        RadioButton(
                            selected = question.correctIndex == optIndex,
                            onClick = { viewModel.setQuestionCorrect(qIndex, optIndex) },
                            modifier = Modifier.semantics { contentDescription = markCorrectLabel },
                        )
                        OutlinedTextField(
                            value = option,
                            onValueChange = { viewModel.setQuestionOption(qIndex, optIndex, it) },
                            placeholder = { Text(stringResource(R.string.play_option_placeholder, optIndex + 1)) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (question.options.size < 6) {
                    Text(
                        text = "+ ${stringResource(R.string.play_add_option)}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .padding(start = 16.dp, top = 4.dp)
                            .clickable { viewModel.addQuestionOption(qIndex) },
                    )
                }
            }
        }
        if (state.questions.size < 20) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 4.dp),
            ) {
                IconButton(onClick = viewModel::addQuestion) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.play_add_question))
                }
                Text(text = stringResource(R.string.play_add_question), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun MemoryBuilder(state: PlayCreateChallengeUiState, viewModel: PlayCreateChallengeViewModel) {
    Text(text = stringResource(R.string.play_memory_pairs_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.pairs.chunked(2).forEachIndexed { rowIndex, pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                pair.forEachIndexed { colIndex, value ->
                    val pairIndex = rowIndex * 2 + colIndex
                    OutlinedTextField(
                        value = value,
                        onValueChange = { viewModel.setPair(pairIndex, it) },
                        placeholder = { Text(stringResource(R.string.play_pair_placeholder, pairIndex + 1)) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        if (state.pairs.size < 12) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                IconButton(onClick = viewModel::addPair) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.play_add_pair))
                }
                Text(text = stringResource(R.string.play_add_pair), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun LogicBuilder(state: PlayCreateChallengeUiState, viewModel: PlayCreateChallengeViewModel) {
    Text(text = stringResource(R.string.play_logic_prompt_label), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
    OutlinedTextField(
        value = state.logicPrompt,
        onValueChange = viewModel::setLogicPrompt,
        placeholder = { Text(stringResource(R.string.play_logic_prompt_placeholder)) },
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
    )

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        FilterChip(
            selected = state.logicAnswerType == "choice",
            onClick = { viewModel.setLogicAnswerType("choice") },
            label = { Text(stringResource(R.string.play_logic_answer_type_choice)) },
            modifier = Modifier.weight(1f),
        )
        FilterChip(
            selected = state.logicAnswerType == "text",
            onClick = { viewModel.setLogicAnswerType("text") },
            label = { Text(stringResource(R.string.play_logic_answer_type_text)) },
            modifier = Modifier.weight(1f),
        )
    }

    if (state.logicAnswerType == "choice") {
        val markCorrectLabel = stringResource(R.string.play_mark_correct)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.logicOptions.forEachIndexed { optIndex, option ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = state.logicCorrectIndex == optIndex,
                        onClick = { viewModel.setLogicCorrectIndex(optIndex) },
                        modifier = Modifier.semantics { contentDescription = markCorrectLabel },
                    )
                    OutlinedTextField(
                        value = option,
                        onValueChange = { viewModel.setLogicOption(optIndex, it) },
                        placeholder = { Text(stringResource(R.string.play_option_placeholder, optIndex + 1)) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            if (state.logicOptions.size < 6) {
                Text(
                    text = "+ ${stringResource(R.string.play_add_option)}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .clickable { viewModel.addLogicOption() },
                )
            }
        }
    } else {
        Text(text = stringResource(R.string.play_logic_free_text_answer), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
        OutlinedTextField(
            value = state.logicAnswer,
            onValueChange = viewModel::setLogicAnswer,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
