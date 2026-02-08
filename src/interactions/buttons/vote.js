module.exports = async function handleVote(interaction) {
    // Logic handled by Game collector. 
    // This file remains to prevent errors if interaction is received after collector ends.
    try {
        await interaction.deferUpdate();
    } catch (e) { }
};
